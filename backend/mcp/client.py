import sys
import subprocess
import json
import logging
import os
import threading
import selectors
import time

logger = logging.getLogger("mcp_client")

class SplunkMCPClient:
    def __init__(self, server_path=None):
        if server_path is None:
            # Default to mock_splunk.py in the same parent directory structure
            base_dir = os.path.dirname(os.path.abspath(__file__))
            server_path = os.path.join(base_dir, "mock_splunk.py")
            
        logger.info(f"Starting Splunk MCP Server subprocess: {server_path}")
        self.process = subprocess.Popen(
            [sys.executable, server_path],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            bufsize=1
        )
        self.request_id = 1
        self.lock = threading.Lock()
        
        # Start server initialization
        try:
            init_res = self.send_request("initialize", {
                "protocolVersion": "2024-11-05",
                "capabilities": {},
                "clientInfo": {"name": "auto-sre-agent-client", "version": "1.0.0"}
            })
            logger.info(f"Splunk MCP Server initialized. Info: {init_res}")
        except Exception as e:
            logger.error(f"Handshake failed: {e}")
            self.close()
            raise

    def send_request(self, method, params):
        with self.lock:
            return self._send_request(method, params)

    def _send_request(self, method, params):
        req = {
            "jsonrpc": "2.0",
            "id": self.request_id,
            "method": method,
            "params": params
        }
        curr_id = self.request_id
        self.request_id += 1
        
        # Write JSON request line
        logger.debug(f"Sending JSON-RPC Request: {req}")
        self.process.stdin.write(json.dumps(req) + "\n")
        self.process.stdin.flush()
        
        # Read JSON response line
        deadline = time.monotonic() + 10
        data = bytearray()
        with selectors.DefaultSelector() as selector:
            selector.register(self.process.stdout, selectors.EVENT_READ)
            while b"\n" not in data:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not selector.select(timeout=remaining):
                    self.close()
                    raise TimeoutError("MCP response deadline exceeded")
                chunk = os.read(self.process.stdout.fileno(), 65536)
                if not chunk:
                    break
                data.extend(chunk)
                if len(data) > 1_000_000:
                    self.close()
                    raise RuntimeError("MCP response too large")
        line = data.decode("utf-8")
        if not line:
            # Check stderr log to see what crashed
            raise RuntimeError("MCP server terminated unexpectedly")
            
        resp = json.loads(line)
        logger.debug(f"Received JSON-RPC Response: {resp}")
        
        if resp.get("id") != curr_id:
            raise RuntimeError("MCP response ID mismatch")
        if "error" in resp:
            err = resp["error"]
            raise RuntimeError(f"MCP Error [{err.get('code')}]: {err.get('message')}")
            
        return resp.get("result")

    def list_tools(self):
        """Fetch available tools from the MCP server"""
        result = self.send_request("tools/list", {})
        return result.get("tools", [])

    def call_tool(self, tool_name, arguments):
        """Invoke a specific tool on the MCP server"""
        result = self.send_request("tools/call", {
            "name": tool_name,
            "arguments": arguments
        })
        content = result.get("content", [])
        if content and content[0].get("type") == "text":
            return json.loads(content[0].get("text"))
        return content

    def close(self):
        if self.process:
            self.process.terminate()
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)
            self.process.stdin.close()
            self.process.stdout.close()
            logger.info("Splunk MCP Server subprocess closed.")

# Simple sanity test when run directly
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    client = SplunkMCPClient()
    try:
        tools = client.list_tools()
        print(f"Available tools: {[t['name'] for t in tools]}")
        
        # Test generate spl
        spl_res = client.call_tool("generate_spl", {"question": "find slow payment queries"})
        print(f"Generated SPL: {spl_res}")
        
        # Test run query
        query_res = client.call_tool("run_splunk_query", {"query": spl_res["spl"]})
        print(f"Query Results (APM): {len(query_res.get('results', []))} items found")
        
        # Test audit log
        audit_res = client.call_tool("log_audit_action", {
            "agent_name": "TestAgent",
            "action": "Triggered manual diagnostics test",
            "status": "success",
            "tokens_used": 150
        })
        print(f"Audit log status: {audit_res}")
    finally:
        client.close()
