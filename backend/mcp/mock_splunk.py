import sys
import json
import logging
import traceback
import sqlite3
import os
import time

# Setup basic logging to stderr so it doesn't interfere with stdout JSON-RPC
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s', stream=sys.stderr)
logger = logging.getLogger("mock_splunk_mcp")

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "hackathon.db")
CODE_REPO_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "code_repo")

# Initialize SQLite database and seed data
def init_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS payment_methods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                status TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        
        # Check if we need to seed
        cursor.execute("SELECT count(*) FROM payment_methods")
        count = cursor.fetchone()[0]
        if count < 20000:
            logger.info(f"Seeding SQLite database with 20,000 records (currently {count})...")
            records = []
            for i in range(20000 - count):
                status = "active" if i % 4 != 0 else "inactive"
                records.append((f"Card-{i}", status))
            cursor.executemany("INSERT INTO payment_methods (name, status) VALUES (?, ?)", records)
            conn.commit()
            logger.info("Database seeding completed.")
        conn.close()
    except Exception as e:
        logger.error(f"Failed to initialize SQLite database: {e}")

# Initialize simulated code repository files
def init_code_repo():
    try:
        os.makedirs(os.path.join(CODE_REPO_DIR, "db"), exist_ok=True)
        os.makedirs(os.path.join(CODE_REPO_DIR, "config"), exist_ok=True)
        os.makedirs(os.path.join(CODE_REPO_DIR, "k8s"), exist_ok=True)
        
        # Scenario A file (Payment queries)
        queries_path = os.path.join(CODE_REPO_DIR, "db", "queries.py")
        if not os.path.exists(queries_path):
            with open(queries_path, "w") as f:
                f.write("# Payment service queries\ndef get_payment_methods():\n    # alex updated query 15m ago\n    query = \"SELECT * FROM payment_methods WHERE status = 'active'\"\n    return query\n")
        
        # Scenario B file (Auth configs)
        config_path = os.path.join(CODE_REPO_DIR, "config", "production.json")
        if not os.path.exists(config_path):
            with open(config_path, "w") as f:
                json.dump({
                    "redis_host": "redis-cache-v2",
                    "redis_port": 6379,
                    "db_host": "postgres-db"
                }, f, indent=4)
                
        # Scenario C file (API Gateway manifests)
        k8s_path = os.path.join(CODE_REPO_DIR, "k8s", "gateway-deployment.yaml")
        if not os.path.exists(k8s_path):
            with open(k8s_path, "w") as f:
                f.write("""apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway-deployment
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: api-gateway
        resources:
          limits:
            cpu: "0.5"
            memory: "512Mi"
""")
        logger.info("Simulated code repository initialized.")
    except Exception as e:
        logger.error(f"Failed to initialize code repository: {e}")

# Call startup setups
init_db()
init_code_repo()

def check_index_exists(index_name):
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='index' AND name=?", (index_name,))
        row = cursor.fetchone()
        conn.close()
        return row is not None
    except Exception as e:
        logger.error(f"Error checking SQLite index: {e}")
        return False

# Audit index logs stored in memory during mock execution
AUDIT_INDEX = []

# Scenarios data definitions
def get_scenarios():
    # Check current index status
    has_index = check_index_exists("idx_payment_methods_status")
    
    # Measure real SQLite query speed (scaled to represent massive prod database)
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    start_time = time.perf_counter()
    c.execute("SELECT * FROM payment_methods WHERE status='active'")
    rows = c.fetchall()
    duration_ms = (time.perf_counter() - start_time) * 1000
    conn.close()
    
    payment_latency = duration_ms + (2.5 if has_index else 575.0)
    
    # Read the payment queries code dynamically for git diff
    try:
        with open(os.path.join(CODE_REPO_DIR, "db", "queries.py"), "r") as f:
            queries_code = f.read()
    except Exception:
        queries_code = ""
        
    # Read the auth config dynamically
    try:
        with open(os.path.join(CODE_REPO_DIR, "config", "production.json"), "r") as f:
            auth_config = json.load(f)
    except Exception:
        auth_config = {"redis_host": "redis-cache-v2"}
        
    # Read gateway deployment resources dynamically
    try:
        with open(os.path.join(CODE_REPO_DIR, "k8s", "gateway-deployment.yaml"), "r") as f:
            gateway_manifest = f.read()
    except Exception:
        gateway_manifest = "cpu: '0.5'"
        
    # Determine cpu throttling based on config
    cpu_limit_high = "cpu: \"2.0\"" in gateway_manifest or "cpu: '2.0'" in gateway_manifest
    gateway_cpu = 25.4 if cpu_limit_high else 98.5
    gateway_drop_rate = 0.0 if cpu_limit_high else 15.0
    gateway_latency = 45 if cpu_limit_high else 920

    scenarios = {
        "latency_spike": {
            "alert": "High Latency on Payment-Service",
            "service": "payment-service",
            "symptoms": f"HTTP response time spiked to {payment_latency:.1f}ms (SLA: 200ms) on POST /payment/charge",
            "apm_traces": [
                {"trace_id": "t101", "span_id": "s201", "parent_span_id": "s101", "service": "payment-service", "operation": "POST /payment/charge", "duration_ms": payment_latency},
                {"trace_id": "t101", "span_id": "s202", "parent_span_id": "s201", "service": "payment-service", "operation": f"SQL: SELECT * FROM payment_methods WHERE status = 'active' (Index applied: {has_index})", "duration_ms": payment_latency - 10},
                {"trace_id": "t101", "span_id": "s203", "parent_span_id": "s202", "service": "postgres-db", "operation": "Query Execution", "duration_ms": payment_latency - 15, "db_query": "SELECT * FROM payment_methods WHERE status = 'active'", "error": None}
            ],
            "k8s_status": {
                "deployment": "payment-service-deployment",
                "replicas": 2,
                "available_replicas": 2,
                "pods": [
                    {"name": "payment-service-7f4d896b-abcde", "status": "Running", "cpu_percent": 35.2 if has_index else 92.4, "memory_mb": 412},
                    {"name": "payment-service-7f4d896b-fghij", "status": "Running", "cpu_percent": 31.8 if has_index else 88.1, "memory_mb": 398}
                ]
            },
            "git_logs": [
                {"commit": "8f3b2cd", "author": "Alex <alex@company.com>", "date": "15 mins ago", "message": "Optimize active payment query filter (added status field)", "diff": "--- a/db/queries.py\n+++ b/db/queries.py\n@@ -12,2 +12,2 @@\n- query = 'SELECT * FROM payment_methods'\n+ query = \"SELECT * FROM payment_methods WHERE status = 'active'\""},
                {"commit": "3a7d9e1", "author": "Sarah <sarah@company.com>", "date": "2 hours ago", "message": "Update payment validation library", "diff": ""}
            ],
            "code_contents": queries_code,
            "remediation_suggestion": "Rollback git commit 8f3b2cd (missing DB index for status field causing table scan) OR execute SQL index hotfix index creation."
        },
        "error_spike": {
            "alert": "High Error Rate on Auth-Service",
            "service": "auth-service",
            "symptoms": "HTTP 500 error rate spiked to 34% (SLA: < 1%)",
            "logs": [
                {"timestamp": "2026-06-14T09:15:00Z", "level": "ERROR", "message": f"Connection refused to {auth_config.get('redis_host')}:6379. Service unreachable."},
                {"timestamp": "2026-06-14T09:15:05Z", "level": "ERROR", "message": "Failed to read user session cache. Falling back to DB - connection timed out."},
                {"timestamp": "2026-06-14T09:15:10Z", "level": "ERROR", "message": "Critical Error: Internal cache connection failure."}
            ],
            "apm_traces": [
                {"trace_id": "t201", "span_id": "s301", "parent_span_id": None, "service": "auth-service", "operation": "GET /auth/verify", "duration_ms": 2500, "error": f"RedisConnectionError: Connection refused to {auth_config.get('redis_host')}"}
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
            "code_contents": json.dumps(auth_config, indent=4),
            "remediation_suggestion": "Rollback git commit 1c9a4ef to restore connection to redis-cache host OR scale deployment auth-service-deployment."
        },
        "cpu_throttling": {
            "alert": "Severe CPU Throttling on API-Gateway",
            "service": "api-gateway",
            "symptoms": f"API Gateway CPU usage spiked to {gateway_cpu:.1f}%, request drop rate at {gateway_drop_rate:.1f}%, average latency is {gateway_latency}ms.",
            "logs": [
                {"timestamp": "2026-06-14T11:45:00Z", "level": "WARNING", "message": "CPU Throttling detected on deployment api-gateway-deployment. Container limit exceeded."},
                {"timestamp": "2026-06-14T11:45:12Z", "level": "ERROR", "message": "Gateway Timeout: Upstream services failing to respond in time due to gateway starvation."},
                {"timestamp": "2026-06-14T11:45:30Z", "level": "ERROR", "message": "Nginx workers starved of CPU: Dropping requests (drop_rate=15%)."}
            ],
            "apm_traces": [
                {"trace_id": "t301", "span_id": "s401", "parent_span_id": None, "service": "api-gateway", "operation": "Proxy Forwarding", "duration_ms": gateway_latency, "error": "GatewayThrottlingException" if gateway_cpu > 90 else None}
            ],
            "k8s_status": {
                "deployment": "api-gateway-deployment",
                "replicas": 2,
                "available_replicas": 2,
                "pods": [
                    {"name": "api-gateway-8f2c7-abcde", "status": "Running", "cpu_percent": gateway_cpu, "memory_mb": 480},
                    {"name": "api-gateway-8f2c7-fghij", "status": "Running", "cpu_percent": gateway_cpu - 4, "memory_mb": 490}
                ]
            },
            "git_logs": [
                {"commit": "9a2d3e", "author": "John <john@company.com>", "date": "20 mins ago", "message": "Optimize cost: Reduce gateway container resources", "diff": "--- a/k8s/gateway-deployment.yaml\n+++ b/k8s/gateway-deployment.yaml\n@@ -10,2 +10,2 @@\n-            cpu: \"2.0\"\n-            memory: \"512Mi\"\n+            cpu: \"0.5\"\n+            memory: \"512Mi\""},
                {"commit": "4e1a2b3", "author": "Alex <alex@company.com>", "date": "1 hour ago", "message": "Update gateway route definitions", "diff": ""}
            ],
            "code_contents": gateway_manifest,
            "remediation_suggestion": "Rollback git resource commit 9a2d3e (restoring CPU limits to 2.0 cores) OR scale gateway deployment to 5 replicas to absorb throttling."
        }
    }
    return scenarios

# Tools definitions
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
                "action_type": {"type": "string", "description": "Type of action: 'execute_sql', 'rollback_commit', or 'scale_deployment'"},
                "target": {"type": "string", "description": "Name of target database, deployment or commit hash"},
                "value": {"type": "string", "description": "SQL statement, replica count, or target configuration details"}
            },
            "required": ["action_type", "target"]
        }
    }
]

def handle_generate_spl(arguments):
    question = arguments.get("question", "").lower()
    if "git" in question or "commit" in question or "vcs" in question:
        return {"spl": "index=vcs repository=* | table commit, author, date, message, diff | head 5"}
    if "kubernetes" in question or "pod" in question:
        return {"spl": "index=infrastructure type=kubernetes | stats avg(cpu) as cpu, avg(memory) as mem by deployment"}
    if "latency" in question or "slow" in question or "payment" in question:
        spl = "index=apm service=payment-service | stats avg(duration_ms) as avg_duration by operation, trace_id | sort -avg_duration"
    elif "throttling" in question or "cpu" in question or "gateway" in question:
        spl = "index=application service=api-gateway level=WARNING | stats count by message"
    elif "error" in question or "auth" in question or "fail" in question:
        spl = "index=application service=auth-service level=ERROR | stats count by message"
    elif "git" in question or "commit" in question or "diff" in question:
        spl = "index=vcs repository=* | table commit, author, date, message, diff | head 5"
    elif "k8s" in question or "pod" in question or "replica" in question:
        spl = "index=infrastructure type=kubernetes | stats avg(cpu) as cpu, avg(memory) as mem by deployment"
    else:
        spl = "index=* | stats count by sourcetype"
    
    return {"spl": spl}

def handle_run_splunk_query(arguments):
    query = arguments.get("query", "").lower()
    # Guardrails are enforced at the tool boundary, not just at the caller.
    try:
        from .security import validate_spl
    except ImportError:  # standalone stdio subprocess
        from security import validate_spl
    valid, reason = validate_spl(query)
    if not valid:
        raise ValueError(reason)
    scenarios = get_scenarios()
    
    if "index=vcs" in query:
        return {"results": [entry for scenario in scenarios.values() for entry in scenario["git_logs"]]}
    if "index=infrastructure" in query:
        return {"results": [scenario["k8s_status"] for scenario in scenarios.values()]}
    # Decide which scenario is being queried based on the query contents
    if "payment-service" in query or "latency" in query or ("apm" in query and "payment" in query):
        scenario = scenarios["latency_spike"]
        return {"results": scenario["apm_traces"]}
            
    elif "api-gateway" in query or "throttling" in query or "gateway" in query:
        scenario = scenarios["cpu_throttling"]
        if "git" in query or "commit" in query or "vcs" in query:
            return {"results": scenario["git_logs"]}
        elif "stats" in query or "cpu" in query:
            return {"results": [scenario["k8s_status"]]}
        else:
            return {"results": scenario["logs"] + scenario["apm_traces"]}
            
    elif "auth-service" in query or "error" in query or "redis" in query:
        scenario = scenarios["error_spike"]
        if "git" in query or "commit" in query or "vcs" in query:
            return {"results": scenario["git_logs"]}
        elif "stats" in query or "cpu" in query:
            return {"results": [scenario["k8s_status"]]}
        else:
            return {"results": scenario["logs"] + scenario["apm_traces"]}
            
    elif "git" in query or "commit" in query or "vcs" in query:
        all_git = scenarios["latency_spike"]["git_logs"] + scenarios["error_spike"]["git_logs"] + scenarios["cpu_throttling"]["git_logs"]
        return {"results": all_git}
        
    elif "infrastructure" in query or "kubernetes" in query:
        return {"results": [scenarios["latency_spike"]["k8s_status"], scenarios["error_spike"]["k8s_status"], scenarios["cpu_throttling"]["k8s_status"]]}
        
    elif "audit" in query:
        return {"results": AUDIT_INDEX}
        
    return {"results": []}

def handle_log_audit_action(arguments):
    audit_entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "agent": arguments.get("agent_name"),
        "action": arguments.get("action"),
        "status": arguments.get("status"),
        "tokens_used": arguments.get("tokens_used", 0)
    }
    AUDIT_INDEX.append(audit_entry)
    del AUDIT_INDEX[:-1000]
    logger.info(f"Audit log registered: {audit_entry}")
    return {"success": True, "logged_entry": audit_entry}

def handle_execute_remediation(arguments):
    action_type = arguments.get("action_type")
    target = arguments.get("target")
    value = arguments.get("value", "")
    
    allowed_sql = "CREATE INDEX idx_payment_methods_status ON payment_methods(status);"
    if action_type == "execute_sql" and (target != "postgres-db" or value != allowed_sql):
        return {"success": False, "message": "Only the predefined index hotfix is permitted."}
    if action_type == "rollback_commit" and target not in {"8f3b2cd", "1c9a4ef", "9a2d3e"}:
        return {"success": False, "message": "Unknown rollback target."}
    if action_type == "scale_deployment" and (target not in {"api-gateway-deployment", "auth-service-deployment"} or value != "5"):
        return {"success": False, "message": "Unsupported simulation scaling option."}
    if action_type not in {"execute_sql", "rollback_commit", "scale_deployment"}:
        return {"success": False, "message": "Unknown remediation action."}

    if action_type == "execute_sql":
        # Run only the allowlisted, idempotent index operation on SQLite
        try:
            with sqlite3.connect(DB_PATH) as conn:
                conn.execute("CREATE INDEX IF NOT EXISTS idx_payment_methods_status ON payment_methods(status)")
            msg = f"Database migration executed successfully on SQLite DB: index created with query '{value}'."
            logger.info(msg)
        except Exception as db_err:
            msg = f"Database migration failed on SQLite: {db_err}"
            logger.error(msg)
            return {"success": False, "message": msg}
            
    elif action_type == "rollback_commit":
        # Actually edit mock code files to revert modifications
        try:
            if target == "8f3b2cd":  # Scenario A (slow payment query)
                queries_path = os.path.join(CODE_REPO_DIR, "db", "queries.py")
                with open(queries_path, "w") as f:
                    f.write("# Payment service queries\ndef get_payment_methods():\n    # Rollback applied - restored basic query\n    query = \"SELECT * FROM payment_methods\"\n    return query\n")
                msg = f"Git rollback completed successfully. Reverted query changes in '{queries_path}'."
                
            elif target == "1c9a4ef":  # Scenario B (redis config mismatch)
                config_path = os.path.join(CODE_REPO_DIR, "config", "production.json")
                with open(config_path, "w") as f:
                    json.dump({
                        "redis_host": "redis-cache",
                        "redis_port": 6379,
                        "db_host": "postgres-db"
                    }, f, indent=4)
                msg = f"Git config rollback completed successfully. Reverted host target to 'redis-cache' in config file."
                
            elif target == "9a2d3e":  # Scenario C (CPU limit reduction)
                k8s_path = os.path.join(CODE_REPO_DIR, "k8s", "gateway-deployment.yaml")
                with open(k8s_path, "w") as f:
                    f.write("""apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-gateway-deployment
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: api-gateway
        resources:
          limits:
            cpu: "2.0"
            memory: "512Mi"
""")
                msg = f"Git deployment manifest rollback completed successfully. Reverted limits to '2.0' in YAML configuration."
            else:
                msg = f"Rollback execute target '{target}' unmapped. Simulator rollback applied."
            logger.info(msg)
        except Exception as git_err:
            msg = f"VCS rollback failed: {git_err}"
            logger.error(msg)
            return {"success": False, "message": msg}
            
    elif action_type == "scale_deployment":
        msg = f"SIMULATION ONLY: would scale deployment '{target}' replica count to {value} pods. Load distributed successfully."
        logger.info(msg)
    else:
        msg = f"Remediation action '{action_type}' executed on '{target}' with values '{value}' successfully."
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
                    "data": "Tool execution failed"
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
