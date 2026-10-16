import os
import json
import logging
import requests
import threading
from typing import TypedDict, List, Dict, Any
from langchain_core.messages import BaseMessage, AIMessage, HumanMessage
from langgraph.graph import StateGraph, END

# Import prompts and MCP client
from backend.agents.prompts import (
    TRIAGE_PROMPT,
    DIAGNOSTICIAN_PROMPT,
    REMEDIATION_PROMPT,
    AUDITOR_PROMPT
)
from backend.mcp.client import SplunkMCPClient

logger = logging.getLogger("agent_graph")

# Define AgentState
class AgentState(TypedDict):
    incident_id: str
    alert_name: str
    service: str
    symptoms: str
    messages: List[BaseMessage]
    splunk_queries: List[str]
    diagnosis: str
    proposed_remediation: Dict[str, Any]
    remediation_status: str  # 'pending', 'approved', 'rejected', 'executed'
    current_node: str
    user_approval_needed: bool
    audit_logs: List[Dict[str, Any]]

# Initialize Splunk MCP Client
mcp_client = None
mcp_init_lock = threading.Lock()
def get_mcp_client():
    global mcp_client
    with mcp_init_lock:
        if mcp_client is None or mcp_client.process.poll() is not None:
            mcp_client = SplunkMCPClient()
        return mcp_client

# Check for API credentials to decide on Live vs Local vs Mock LLM execution
def is_live_llm_enabled() -> bool:
    return os.environ.get("GEMINI_API_KEY") is not None or os.environ.get("GOOGLE_API_KEY") is not None

def is_ollama_available() -> bool:
    try:
        res = requests.get("http://localhost:11434/api/tags", timeout=2)
        if res.status_code == 200:
            # Check if qwen2.5-coder:1.5b or other model is present
            models = [m.get("name") for m in res.json().get("models", [])]
            logger.info(f"Ollama local models found: {models}")
            return True
    except Exception:
        pass
    return False

def run_live_llm(system_prompt: str, user_content: str, model_name=None) -> str:
    """Invokes Google Gemini via langchain_google_genai if keys are configured."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        llm = ChatGoogleGenerativeAI(model=model_name or os.getenv("GEMINI_MODEL", "gemini-2.5-flash"), google_api_key=api_key)
        
        messages = [
            ("system", system_prompt),
            ("user", user_content)
        ]
        resp = llm.invoke(messages)
        return resp.content
    except Exception as e:
        logger.warning("Live LLM execution failed; using fallback (%s)", type(e).__name__)
        return ""

def run_ollama_llm(system_prompt: str, user_content: str, model_name="qwen2.5-coder:1.5b") -> str:
    """Invokes local Ollama endpoint."""
    try:
        logger.info(f"Invoking Ollama chat model: {model_name}")
        url = "http://localhost:11434/api/chat"
        payload = {
            "model": model_name,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            "stream": False
        }
        res = requests.post(url, json=payload, timeout=30)
        if res.status_code == 200:
            return res.json().get("message", {}).get("content", "")
    except Exception as e:
        logger.warning("Ollama execution failed; using simulator (%s)", type(e).__name__)
    return ""

def run_agent_reasoning(system_prompt: str, user_content: str, default_mock_content: str) -> str:
    """Evaluates the 3-tier execution model (Gemini -> Ollama -> Mock)."""
    # 1. Try Gemini
    if is_live_llm_enabled():
        logger.info("Executing Live Gemini Agent...")
        resp = run_live_llm(system_prompt, user_content)
        if resp:
            return resp
            
    # 2. Try Ollama Fallback
    if is_ollama_available():
        logger.info("Gemini keys missing or failed. Executing Local Ollama Agent...")
        resp = run_ollama_llm(system_prompt, user_content)
        if resp:
            return resp
            
    # 3. Fallback to High Fidelity Mock Simulation
    logger.info("No live or local LLM available. Running high-fidelity agent simulator...")
    return "[SIMULATED INCIDENT REASONING — not live telemetry]\n" + default_mock_content

# Triage Node
def triage_node(state: AgentState) -> AgentState:
    logger.info("Executing Triage Agent...")
    alert_name = state.get("alert_name", "Unknown Incident")
    
    # 1. Determine service and symptoms
    if "latency" in alert_name.lower() or "payment" in alert_name.lower():
        service = "payment-service"
        symptoms = "HTTP latency spiked to 650ms on checkout endpoint"
    elif "throttling" in alert_name.lower() or "cpu" in alert_name.lower() or "gateway" in alert_name.lower():
        service = "api-gateway"
        symptoms = "API Gateway CPU usage spiked to 98.5% with request drop rate at 15%"
    else:
        service = "auth-service"
        symptoms = "High HTTP 500 error rate (34%) detected"
        
    state["service"] = service
    state["symptoms"] = symptoms
    state["current_node"] = "triage"
    
    user_msg = f"Triage Alert: {alert_name}\nSymptoms: {symptoms}\nService: {service}"
    mock_resp = f"Triage Complete. Identified critical incident on service '{service}'. Symptoms: {symptoms}. Handoff to Diagnostician Agent for log analysis."
    
    response = run_agent_reasoning(TRIAGE_PROMPT, user_msg, mock_resp)
    state["messages"].append(AIMessage(content=response, name="TriageAgent"))
    return state

# Diagnostician Node
def diagnostician_node(state: AgentState) -> AgentState:
    logger.info("Executing Diagnostician Agent...")
    service = state.get("service")
    symptoms = state.get("symptoms")
    client = get_mcp_client()
    
    from backend.mcp.security import validate_spl
    state["current_node"] = "diagnose"
    
    # Helper to run query with guardrails
    def run_safe_query(prompt_question: str) -> tuple[str, dict]:
        spl_res = client.call_tool("generate_spl", {"question": prompt_question})
        spl_query = spl_res.get("spl", "")
        
        is_valid, reason = validate_spl(spl_query)
        if not is_valid:
            logger.error(f"SPL Guardrail blocked query: {spl_query}. Reason: {reason}")
            raise ValueError(f"SPL Security Policy Violation: {reason}")
            
        result = client.call_tool("run_splunk_query", {"query": spl_query})
        return spl_query, result

    try:
        # Step 1: Run query for telemetry/APM/logs
        tele_spl, telemetry_data = run_safe_query(f"Show anomalies or errors for {service}")
        state["splunk_queries"].append(tele_spl)
        
        # Step 2: Run query for Git commits
        git_spl, git_data = run_safe_query(f"show recent git VCS commits for {service}")
        state["splunk_queries"].append(git_spl)
        
        # Step 3: Run query for Kubernetes status
        k8s_spl, k8s_data = run_safe_query(f"show kubernetes pod status for {service}")
        state["splunk_queries"].append(k8s_spl)
        
    except ValueError as sec_err:
        error_msg = str(sec_err)
        state["diagnosis"] = f"Outage analysis halted. {error_msg}"
        state["messages"].append(AIMessage(
            content=f"Incident diagnosis suspended: {error_msg}. Contact SRE security administrator.",
            name="DiagnosticianAgent"
        ))
        return state

    # Formulate prompt for agent to evaluate
    eval_context = {
        "service": service,
        "symptoms": symptoms,
        "telemetry_logs": telemetry_data,
        "git_history": git_data,
        "k8s_status": k8s_data
    }
    
    user_msg = f"Evaluate this environment telemetry and identify the root cause:\n{json.dumps(eval_context, indent=2)}"
    
    # Setup mock responses
    if service == "payment-service":
        mock_resp = (
            "RCA Diagnosis: I executed SPL searches for APM metrics, Git changes, and Kubernetes pod status.\n"
            "1. APM Traces show a slow database query: `SELECT * FROM payment_methods WHERE status = 'active'` taking 575ms.\n"
            "2. Git logs show commit `8f3b2cd` by Alex 15 minutes ago introduced this query filtering (adding `WHERE status = 'active'`).\n"
            "3. Database schema shows there is NO index on the `status` column, causing a full table scan.\n"
            "4. Pods are running hot (90%+ CPU) trying to handle the queue backlog.\n"
            "Root Cause: Missing index on the newly added status column in the payments DB table. Recommend rolling back commit `8f3b2cd` or executing SQL index hotfix."
        )
    elif service == "api-gateway":
        mock_resp = (
            "RCA Diagnosis: I ran telemetry, config repo, and pod status reviews.\n"
            "1. Nginx workers show high CPU throttling due to container resource constraints.\n"
            "2. Git history shows commit `9a2d3e` by John 20 mins ago reduced gateway CPU limits to `0.5` cores (limits.cpu = 0.5).\n"
            "3. Replicas are running at maximum capacity with 15% drop rate.\n"
            "Root Cause: Insufficient CPU limits for API Gateway after cost optimization config commit. Recommend rolling back commit `9a2d3e` to restore 2.0 cores limit, or scaling replicas to 5."
        )
    else:
        mock_resp = (
            "RCA Diagnosis: I analyzed application logs, APM errors, and Git configurations.\n"
            "1. App logs show repeated `Connection refused to redis-cache:6379` errors.\n"
            "2. APM trace verifies a `RedisConnectionError` on auth checks.\n"
            "3. Git history reveals commit `1c9a4ef` by Sarah 10 minutes ago refactored cache config and updated the host to `redis-cache-v2`.\n"
            "4. Kubernetes service mapping verifies `redis-cache-v2` is not registered. It is a configuration error.\n"
            "Root Cause: Misconfigured Redis caching host target. Recommend rolling back commit `1c9a4ef` to restore caching and clear auth failures."
        )
        
    response = run_agent_reasoning(DIAGNOSTICIAN_PROMPT, user_msg, mock_resp)
    state["diagnosis"] = response
    state["messages"].append(AIMessage(content=response, name="DiagnosticianAgent"))
    return state

# Remediation Node
def remediation_node(state: AgentState) -> AgentState:
    logger.info("Executing Remediation Agent...")
    diagnosis = state.get("diagnosis", "")
    service = state.get("service")
    status = state.get("remediation_status", "pending")
    
    state["current_node"] = "remediate"
    
    # 1. Plan remediation options
    if service == "payment-service":
        options = [
            {
                "action_type": "execute_sql",
                "target": "postgres-db",
                "value": "CREATE INDEX idx_payment_methods_status ON payment_methods(status);",
                "title": "Apply Database Index Hotfix (Recommended & Safe)"
            },
            {
                "action_type": "rollback_commit",
                "target": "8f3b2cd",
                "value": "Revert slow DB query commit",
                "title": "Rollback Git code commit 8f3b2cd (Destructive)"
            }
        ]
    elif service == "api-gateway":
        options = [
            {
                "action_type": "rollback_commit",
                "target": "9a2d3e",
                "value": "Revert gateway CPU limit reduction",
                "title": "Rollback Git config commit 9a2d3e (Recommended & Safe)"
            },
            {
                "action_type": "scale_deployment",
                "target": "api-gateway-deployment",
                "value": "5",
                "title": "Scale API-Gateway deployment to 5 replicas (Temporary buffer)"
            }
        ]
    else:
        options = [
            {
                "action_type": "rollback_commit",
                "target": "1c9a4ef",
                "value": "Revert redis cache host configuration change",
                "title": "Rollback Git config commit 1c9a4ef (Recommended)"
            },
            {
                "action_type": "scale_deployment",
                "target": "auth-service-deployment",
                "value": "5",
                "title": "Scale pods to 5 replicas (Temporary mitigation)"
            }
        ]
        
    state["proposed_remediation"] = {
        "options": options,
        "selected_option": state.get("proposed_remediation", {}).get("selected_option", {})
    }
    
    # 2. Check if we need Human-In-The-Loop approval
    if status == "pending":
        # First time visiting node: pause for human approval
        logger.info("Critical remediation options prepared. Pausing for Human-in-the-Loop approval...")
        state["user_approval_needed"] = True
        state["remediation_status"] = "pending"
        
        user_msg = f"Compile remediation recommendations for {service} based on diagnosis: {diagnosis}"
        mock_resp = f"Proposed remediation plans compiled: \n1. {options[0]['title']} \n2. {options[1]['title']}. Requesting operator authorization to apply one of these remedies."
        
        response = run_agent_reasoning(REMEDIATION_PROMPT, user_msg, mock_resp)
        state["messages"].append(AIMessage(content=response, name="RemediationAgent"))
        return state
        
    elif status == "approved":
        # Resumed and approved by human
        selected = state["proposed_remediation"].get("selected_option")
        if not selected or "action_type" not in selected:
            # Fallback to first option if empty
            selected = options[0]
            
        action_type = selected["action_type"]
        target = selected["target"]
        value = selected["value"]
        
        logger.info(f"Remediation approved by human: {action_type} on {target} ({value})")
        client = get_mcp_client()
        exec_res = client.call_tool("execute_remediation", {
            "action_type": action_type,
            "target": target,
            "value": value
        })
        
        state["user_approval_needed"] = False
        state["remediation_status"] = "executed" if exec_res.get("success") else "failed"
        if not exec_res.get("success"):
            state["messages"].append(AIMessage(content="Remediation failed; manual intervention required.", name="RemediationAgent"))
            return state
        
        success_msg = f"Remediation executed successfully: {exec_res.get('message')}. System status returning to normal."
        state["messages"].append(AIMessage(content=success_msg, name="RemediationAgent"))
        
    elif status == "rejected":
        # Resumed and rejected by human
        logger.info("Remediation rejected by human.")
        state["user_approval_needed"] = False
        state["remediation_status"] = "rejected"
        state["messages"].append(AIMessage(
            content="Remediation plans rejected by user. SRE operator will take over manually.",
            name="RemediationAgent"
        ))
        
    return state

# Auditor Node
def auditor_node(state: AgentState) -> AgentState:
    logger.info("Executing Auditor Agent...")
    client = get_mcp_client()
    state["current_node"] = "audit"
    
    service = state.get("service")
    diagnosis = state.get("diagnosis", "")
    remediation = state.get("proposed_remediation", {}).get("selected_option", {})
    status = state.get("remediation_status")
    
    # Log audit trail to Splunk
    audit_msg = f"Completed incident resolution for {service}. Diagnosis: {diagnosis[:150]}... Action: {remediation.get('action_type')} on {remediation.get('target')} - Status: {status}"
    audit_res = client.call_tool("log_audit_action", {
        "agent_name": "AuditorAgent",
        "action": audit_msg,
        "status": status,
        "tokens_used": 0
    })
    
    state["audit_logs"].append(audit_res.get("logged_entry", {}))
    
    # Generate post-incident summary
    post_mortem = (
        f"# Incident Post-Mortem Report\n"
        f"**Service:** {service}\n"
        f"**Resolution Status:** {status.upper()}\n\n"
        f"### RCA Findings\n"
        f"{diagnosis}\n\n"
        f"### Resolution Actions\n"
        f"Action: {remediation.get('action_type')} on {remediation.get('target')}\n"
        f"Auditing logged to Splunk index: {json.dumps(audit_res.get('logged_entry'))}\n"
    )
    
    response = run_agent_reasoning(
        AUDITOR_PROMPT, 
        f"Generate post-mortem report for {service} resolved with status {status}", 
        post_mortem
    )
    state["messages"].append(AIMessage(content=response, name="AuditorAgent"))
    return state

# Build the Graph
def build_sre_graph(resume=False):
    builder = StateGraph(AgentState)
    
    # Register nodes
    builder.add_node("triage", triage_node)
    builder.add_node("diagnose", diagnostician_node)
    builder.add_node("remediate", remediation_node)
    builder.add_node("audit", auditor_node)
    
    # Set entry point
    builder.set_entry_point("remediate" if resume else "triage")
    
    # Set linear edges
    builder.add_edge("triage", "diagnose")
    builder.add_edge("diagnose", "remediate")
    
    # Conditional edge for Remediation (pauses if HITL approval is needed)
    def should_continue(state: AgentState):
        if state.get("user_approval_needed"):
            return END
        return "audit"
        
    builder.add_conditional_edges("remediate", should_continue, {
        END: END,
        "audit": "audit"
    })
    
    builder.add_edge("audit", END)
    
    return builder.compile()

# Singleton instance of compiled graph
_compiled_graph = None
def get_graph(resume=False):
    if resume:
        return build_sre_graph(resume=True)
    global _compiled_graph
    if _compiled_graph is None:
        _compiled_graph = build_sre_graph()
    return _compiled_graph

def serialize_state(state):
    return {
        "incident_id": state.get("incident_id"),
        "alert_name": state.get("alert_name"),
        "service": state.get("service"),
        "symptoms": state.get("symptoms"),
        "splunk_queries": state.get("splunk_queries", []),
        "diagnosis": state.get("diagnosis"),
        "proposed_remediation": state.get("proposed_remediation"),
        "remediation_status": state.get("remediation_status"),
        "current_node": state.get("current_node"),
        "user_approval_needed": state.get("user_approval_needed"),
        "audit_logs": state.get("audit_logs", []),
        "messages": [
            {
                "role": "assistant" if msg.type == "ai" else "user",
                "name": getattr(msg, "name", "Agent"),
                "content": msg.content
            } for msg in state.get("messages", [])
        ]
    }
