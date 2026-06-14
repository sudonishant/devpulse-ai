import sys
import json
import logging
import traceback

# Setup basic logging to stderr so it doesn't interfere with stdout JSON-RPC
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', stream=sys.stderr)
logger = logging.getLogger("mock_splunk_mcp")

# Scenarios data
SCENARIOS = {
    "latency_spike": {
        "alert": "High Latency on Payment-Service",
        "service": "payment-service",
        "symptoms": "HTTP response time spiked to 650ms (SLA: 200ms) on POST /payment/charge",
        "apm_traces": [
            {"trace_id": "t101", "span_id": "s201", "parent_span_id": "s101", "service": "payment-service", "operation": "POST /payment/charge", "duration_ms": 650},
            {"trace_id": "t101", "span_id": "s202", "parent_span_id": "s201", "service": "payment-service", "operation": "SQL: SELECT * FROM payment_methods WHERE status = 'active'", "duration_ms": 580},
            {"trace_id": "t101", "span_id": "s203", "parent_span_id": "s202", "service": "postgres-db", "operation": "Query Execution", "duration_ms": 575, "db_query": "SELECT * FROM payment_methods WHERE status = 'active'", "error": None}
        ],
        "k8s_status": {
            "deployment": "payment-service-deployment",
            "replicas": 2,
            "available_replicas": 2,
            "pods": [
                {"name": "payment-service-7f4d896b-abcde", "status": "Running", "cpu_percent": 92.4, "memory_mb": 412},
                {"name": "payment-service-7f4d896b-fghij", "status": "Running", "cpu_percent": 88.1, "memory_mb": 398}
            ]
        },
        "git_logs": [
            {"commit": "8f3b2cd", "author": "Alex <alex@company.com>", "date": "15 mins ago", "message": "Optimize active payment query filter (added status field)", "diff": "--- a/db/queries.py\n+++ b/db/queries.py\n@@ -12,2 +12,2 @@\n- query = 'SELECT * FROM payment_methods'\n+ query = \"SELECT * FROM payment_methods WHERE status = 'active'\""},
            {"commit": "3a7d9e1", "author": "Sarah <sarah@company.com>", "date": "2 hours ago", "message": "Update payment validation library", "diff": ""}
        ],
        "remediation_suggestion": "Rollback git commit 8f3b2cd (missing DB index for status field causing table scan) OR scale deployment payment-service-deployment to 5 replicas as an immediate buffer."
    },
    "error_spike": {
        "alert": "High Error Rate on Auth-Service",
        "service": "auth-service",
        "symptoms": "HTTP 500 error rate spiked to 34% (SLA: < 1%)",
        "logs": [
            {"timestamp": "2026-06-14T09:15:00Z", "level": "ERROR", "message": "Connection refused to redis-cache:6379. Service unreachable."},
            {"timestamp": "2026-06-14T09:15:05Z", "level": "ERROR", "message": "Failed to read user session cache. Falling back to DB - connection timed out."},
            {"timestamp": "2026-06-14T09:15:10Z", "level": "ERROR", "message": "Critical Error: Internal cache connection failure."}
        ],
        "apm_traces": [
            {"trace_id": "t201", "span_id": "s301", "parent_span_id": None, "service": "auth-service", "operation": "GET /auth/verify", "duration_ms": 2500, "error": "RedisConnectionError: Connection refused"}
        ],
        "k8s_status": {
            "deployment": "auth-service-deployment",
            "replicas": 3,
            "available_replicas": 3,
            "pods": [
                {"name": "auth-service-59bc4c-12345", "status": "Running", "cpu_percent": 12.1, "memory_mb": 150},
                {"name": "auth-service-59bc4c-67890", "status": "Running", "cpu_percent": 15.4, "memory_mb": 148},
                {"name": "auth-service-59bc4c-abcde", "status": "Running", "cpu_percent": 11.2, "memory_mb": 152}
            ]
        },
        "git_logs": [
            {"commit": "1c9a4ef", "author": "Sarah <sarah@company.com>", "date": "10 mins ago", "message": "Refactor: Point auth cache to new redis cluster endpoint", "diff": "--- a/config/production.json\n+++ b/config/production.json\n@@ -4,2 +4,2 @@\n- \"redis_host\": \"redis-cache\",\n+ \"redis_host\": \"redis-cache-v2\","},
            {"commit": "7b2d12e", "author": "John <john@company.com>", "date": "4 hours ago", "message": "Clean up unused logs in auth helper", "diff": ""}
        ],
        "remediation_suggestion": "Rollback git commit 1c9a4ef (redis-cache-v2 is not registered in the Kubernetes DNS or service mapping) OR run config fix to revert host to redis-cache."
    }
}

# Audit index logs stored in memory during mock execution
AUDIT_INDEX = []

# Tools definition
TOOLS = [
    {
        "name": "generate_spl",
        "description": "Convert natural language questions into Splunk Processing Language (SPL) queries.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "question": {"type": "string", "description": "The natural language question to translate to SPL. e.g. 'Show slow transactions on payment-service'"}
            },
            "required": ["question"]
        }
    },
    {
        "name": "run_splunk_query",
        "description": "Execute an SPL query against Splunk to fetch metrics, traces, git logs, or app logs.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The SPL query to run. e.g. 'index=apm service=payment-service | stats avg(duration_ms) by operation'"}
            },
            "required": ["query"]
        }
    },
    {
        "name": "log_audit_action",
        "description": "Write a structured audit entry back into the Splunk audit index documenting an agent decision or tool action.",
        "inputSchema": {
            "type": "object",
            "properties": {
                "agent_name": {"type": "string", "description": "Name of the agent taking action"},
                "action": {"type": "string", "description": "Description of the action taken or reasoning details"},
                "status": {"type": "string", "description": "Status of the action (success, failed, pending_approval)"},
                "tokens_used": {"type": "integer", "description": "Optional token cost tracking"}
            },
            "required": ["agent_name", "action", "status"]
        }
    },
    {
        "name": "execute_remediation",
        "description": "Execute a healing action on the Kubernetes cluster or git repository. (Requires Human-In-The-Loop approval flag first)",
        "inputSchema": {
            "type": "object",
            "properties": {
                "action_type": {"type": "string", "description": "Type of action: 'scale_deployment' or 'rollback_commit'"},
                "target": {"type": "string", "description": "Name of target deployment or commit hash"},
                "value": {"type": "string", "description": "New replica count (e.g. '5') or commit rollback parameter"}
            },
            "required": ["action_type", "target"]
        }
    }
]

def handle_generate_spl(arguments):
    question = arguments.get("question", "").lower()
    if "latency" in question or "slow" in question or "payment" in question:
        spl = "index=apm service=payment-service | stats avg(duration_ms) as avg_duration by operation, trace_id | sort -avg_duration"
    elif "error" in question or "auth" in question or "fail" in question:
        spl = "index=application service=auth-service level=ERROR | stats count by message"
    elif "git" in question or "commit" in question:
        spl = "index=vcs repository=* | table commit, author, date, message, diff | head 5"
    elif "k8s" in question or "pod" in question or "replica" in question:
        spl = "index=infrastructure type=kubernetes | stats avg(cpu) as cpu, avg(memory) as mem by deployment"
    else:
        spl = "index=* | stats count by sourcetype"
    
    return {"spl": spl}

def handle_run_splunk_query(arguments):
    query = arguments.get("query", "").lower()
    
    # Decide which scenario is being queried based on the query contents
    if "payment-service" in query or "latency" in query or "apm" in query and "payment" in query:
        scenario = SCENARIOS["latency_spike"]
        # Return APM traces or K8s metrics depending on query specifics
        if "stats" in query or "cpu" in query:
            return {"results": [scenario["k8s_status"]]}
        else:
            return {"results": scenario["apm_traces"]}
            
    elif "auth-service" in query or "error" in query or "redis" in query:
        scenario = SCENARIOS["error_spike"]
        if "git" in query or "commit" in query or "vcs" in query:
            return {"results": scenario["git_logs"]}
        elif "stats" in query or "cpu" in query:
            return {"results": [scenario["k8s_status"]]}
        else:
            # logs or APM traces
            return {"results": scenario["logs"] + scenario["apm_traces"]}
            
    elif "git" in query or "commit" in query or "vcs" in query:
        # Generic VCS search: combine git logs of all scenarios
        all_git = SCENARIOS["latency_spike"]["git_logs"] + SCENARIOS["error_spike"]["git_logs"]
        return {"results": all_git}
        
    elif "infrastructure" in query or "kubernetes" in query:
        return {"results": [SCENARIOS["latency_spike"]["k8s_status"], SCENARIOS["error_spike"]["k8s_status"]]}
        
    elif "audit" in query:
        return {"results": AUDIT_INDEX}
        
    return {"results": []}

def handle_log_audit_action(arguments):
    audit_entry = {
        "timestamp": "2026-06-14T09:24:00Z",
        "agent": arguments.get("agent_name"),
        "action": arguments.get("action"),
        "status": arguments.get("status"),
        "tokens_used": arguments.get("tokens_used", 0)
    }
    AUDIT_INDEX.append(audit_entry)
    logger.info(f"Audit log registered: {audit_entry}")
    return {"success": True, "logged_entry": audit_entry}

def handle_execute_remediation(arguments):
    action_type = arguments.get("action_type")
    target = arguments.get("target")
    value = arguments.get("value", "")
    
    if action_type == "execute_sql":
        msg = f"Database migration executed successfully: {value} on target schema {target}"
    else:
        msg = f"Remediation successfully executed: {action_type} on {target} with value {value}"
    logger.info(msg)
    return {"success": True, "message": msg}

def process_message(line):
    try:
        req = json.loads(line)
    except Exception as e:
        logger.error(f"Failed to parse line as JSON: {e}")
        return
        
    if "jsonrpc" not in req:
        return
        
    req_id = req.get("id")
    method = req.get("method")
    params = req.get("params", {})
    
    # Standard MCP Handshake
    if method == "initialize":
        resp = {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "serverInfo": {"name": "mock-splunk-mcp", "version": "1.0.0"}
            }
        }
    elif method == "tools/list":
        resp = {
            "jsonrpc": "2.0",
            "id": req_id,
            "result": {"tools": TOOLS}
        }
    elif method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments", {})
        
        logger.info(f"Received tool call request: {name} with arguments: {arguments}")
        try:
            if name == "generate_spl":
                result = handle_generate_spl(arguments)
            elif name == "run_splunk_query":
                result = handle_run_splunk_query(arguments)
            elif name == "log_audit_action":
                result = handle_log_audit_action(arguments)
            elif name == "execute_remediation":
                result = handle_execute_remediation(arguments)
            else:
                raise ValueError(f"Unknown tool: {name}")
                
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "result": {
                    "content": [{"type": "text", "text": json.dumps(result, indent=2)}]
                }
            }
        except Exception as tool_err:
            resp = {
                "jsonrpc": "2.0",
                "id": req_id,
                "error": {
                    "code": -32603,
                    "message": str(tool_err),
                    "data": traceback.format_exc()
                }
            }
    else:
        resp = {
            "jsonrpc": "2.0",
            "id": req_id,
            "error": {"code": -32601, "message": f"Method not found: {method}"}
        }
        
    # Write response to stdout
    sys.stdout.write(json.dumps(resp) + "\n")
    sys.stdout.flush()

def main():
    logger.info("Splunk Mock MCP Server initialized and listening on stdio...")
    for line in sys.stdin:
        if not line.strip():
            continue
        process_message(line)

if __name__ == "__main__":
    main()
