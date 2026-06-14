import os
import json
import logging
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
def get_mcp_client():
    global mcp_client
    if mcp_client is None:
        mcp_client = SplunkMCPClient()
    return mcp_client

# Check for API credentials to decide on Live vs Mock LLM execution
def is_live_llm_enabled() -> bool:
    return os.environ.get("GEMINI_API_KEY") is not None or os.environ.get("GOOGLE_API_KEY") is not None

def run_live_llm(system_prompt: str, user_content: str, model_name="gemini-1.5-flash") -> str:
    """Invokes Google Gemini via langchain_google_genai if keys are configured."""
    try:
        from langchain_google_genai import ChatGoogleGenerativeAI
        api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
        llm = ChatGoogleGenerativeAI(model=model_name, google_api_key=api_key)
        
        messages = [
            ("system", system_prompt),
            ("user", user_content)
        ]
        resp = llm.invoke(messages)
        return resp.content
    except Exception as e:
        logger.error(f"Live LLM execution failed: {e}. Falling back to simulator.")
        return ""

# Triage Node
def triage_node(state: AgentState) -> AgentState:
    logger.info("Executing Triage Agent...")
    alert_name = state.get("alert_name", "Unknown Incident")
    
    # 1. Determine service and symptoms
    if "latency" in alert_name.lower() or "payment" in alert_name.lower():
        service = "payment-service"
        symptoms = "HTTP latency spiked to 650ms on checkout endpoint"
    else:
        service = "auth-service"
        symptoms = "High HTTP 500 error rate (34%) detected"
        
    state["service"] = service
    state["symptoms"] = symptoms
    state["current_node"] = "triage"
    
    # Run LLM (or mock reasoning)
    user_msg = f"Triage Alert: {alert_name}\nSymptoms: {symptoms}\nService: {service}"
    if is_live_llm_enabled():
        response = run_live_llm(TRIAGE_PROMPT, user_msg)
    else:
        # Mock Response
        response = f"Triage Complete. Identified critical incident on service '{service}'. Symptoms: {symptoms}. Handoff to Diagnostician Agent for log analysis."
        
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
        git_spl, git_data = run_safe_query("show recent git VCS commits")
        state["splunk_queries"].append(git_spl)
        
        # Step 3: Run query for Kubernetes status
        k8s_spl, k8s_data = run_safe_query("show kubernetes pod status")
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
    
    if is_live_llm_enabled():
        response = run_live_llm(DIAGNOSTICIAN_PROMPT, user_msg)
    else:
        # Mock highly specific root-cause reasoning based on scenario
        if service == "payment-service":
            response = (
                "RCA Diagnosis: I executed SPL searches for APM metrics, Git changes, and Kubernetes pod status.\n"
                "1. APM Traces show a slow database query: `SELECT * FROM payment_methods WHERE status = 'active'` taking 575ms.\n"
                "2. Git logs show commit `8f3b2cd` by Alex 15 minutes ago introduced this query filtering (adding `WHERE status = 'active'`).\n"
                "3. Database schema shows there is NO index on the `status` column, causing a full table scan.\n"
                "4. Pods are running hot (90%+ CPU) trying to handle the queue backlog.\n"
                "Root Cause: Missing index on the newly added status column in the payments DB table. Recommend rolling back commit `8f3b2cd` or scaling payment replicas."
            )
        else:
            response = (
                "RCA Diagnosis: I analyzed application logs, APM errors, and Git configurations.\n"
                "1. App logs show repeated `Connection refused to redis-cache:6379` errors.\n"
                "2. APM trace verifies a `RedisConnectionError` on auth checks.\n"
                "3. Git history reveals commit `1c9a4ef` by Sarah 10 minutes ago refactored cache config and updated the host to `redis-cache-v2`.\n"
                "4. Kubernetes service mapping verifies `redis-cache-v2` is not registered. It is a configuration error.\n"
                "Root Cause: Misconfigured Redis caching host target. Recommend rolling back commit `1c9a4ef` to restore caching and clear auth failures."
            )
            
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
        state["messages"].append(AIMessage(
            content=f"Proposed remediation plans compiled: \n1. {options[0]['title']} \n2. {options[1]['title']}. Requesting operator authorization to apply one of these remedies.",
            name="RemediationAgent"
        ))
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
        state["remediation_status"] = "executed"
        state["messages"].append(AIMessage(
            content=f"Remediation executed successfully: {exec_res.get('message')}. System status returning to normal.",
            name="RemediationAgent"
        ))
        
    elif status == "rejected":
        # Resumed and rejected by human
        logger.info("Remediation rejected by human.")
        state["user_approval_needed"] = False
        state["remediation_status"] = "rejected"
        state["messages"].append(AIMessage(
            content=f"Remediation plans rejected by user. SRE operator will take over manually.",
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
    remediation = state.get("proposed_remediation", {})
    status = state.get("remediation_status")
    
    # Log audit trail to Splunk
    audit_msg = f"Completed incident resolution for {service}. Diagnosis: {diagnosis[:150]}... Action: {remediation.get('action_type')} on {remediation.get('target')} - Status: {status}"
    audit_res = client.call_tool("log_audit_action", {
        "agent_name": "AuditorAgent",
        "action": audit_msg,
        "status": "success",
        "tokens_used": 1850
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
    
    state["messages"].append(AIMessage(content=post_mortem, name="AuditorAgent"))
    return state

# Build the Graph
def build_sre_graph():
    builder = StateGraph(AgentState)
    
    # Register nodes
    builder.add_node("triage", triage_node)
    builder.add_node("diagnose", diagnostician_node)
    builder.add_node("remediate", remediation_node)
    builder.add_node("audit", auditor_node)
    
    # Set entry point
    builder.set_entry_point("triage")
    
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
def get_graph():
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
