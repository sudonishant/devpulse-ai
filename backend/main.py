import os
import uuid
import logging
from typing import Dict, List, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio
import copy
import secrets
import time
from contextlib import asynccontextmanager
from collections import defaultdict, deque
from typing import Literal
from fastapi import Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import Field
from dotenv import load_dotenv

load_dotenv()

@asynccontextmanager
async def lifespan(app):
    if os.getenv("DEVPULSE_ENV") == "production" and not os.getenv("DEVPULSE_API_TOKEN"):
        raise RuntimeError("Production requires DEVPULSE_API_TOKEN")
    yield
    from backend.agents import graph as agent_graph
    if agent_graph.mcp_client is not None:
        agent_graph.mcp_client.close()
        agent_graph.mcp_client = None


# Import agents and state graph
from backend.agents.graph import get_graph, AgentState, serialize_state
from langchain_core.messages import AIMessage, HumanMessage
from backend.devpulse import analyze_code as run_devpulse_analysis, detect_provider_from_key

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("main_server")

app = FastAPI(title="DevPulse AI API Server", version="1.0.0", lifespan=lifespan)

# CORS setup for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=[u.strip() for u in os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Pydantic's default error details include input values; never echo submitted secrets/code.
    return JSONResponse({"detail": "Invalid request fields", "fields": [list(error["loc"]) for error in exc.errors()]}, status_code=422)

# Single-process development limits; use an authenticated gateway for multi-worker deployments.
request_windows = defaultdict(deque)
MAX_BODY = 250_000

@app.middleware("http")
async def protect_api(request: Request, call_next):
    if request.method == "OPTIONS":
        return await call_next(request)
    expected = os.getenv("DEVPULSE_API_TOKEN", "")
    if expected and not secrets.compare_digest(request.headers.get("authorization", ""), "Bearer " + expected):
        return JSONResponse({"detail": "Unauthorized"}, status_code=401)
    # Reject oversized bodies, including chunked requests, before Pydantic parses them.
    body = bytearray()
    async for chunk in request.stream():
        body.extend(chunk)
        if len(body) > MAX_BODY:
            return JSONResponse({"detail": "Request too large"}, status_code=413)
    request._body = bytes(body)
    host = request.client.host if request.client else "unknown"
    now = time.monotonic()
    if len(request_windows) > 2048:
        for key in list(request_windows):
            if not request_windows[key] or request_windows[key][-1] < now - 60:
                del request_windows[key]
        if len(request_windows) > 2048:
            return JSONResponse({"detail": "Server busy"}, status_code=429)
    window = request_windows[host]
    while window and window[0] < now - 60:
        window.popleft()
    if len(window) >= 60:
        return JSONResponse({"detail": "Rate limit exceeded"}, status_code=429)
    window.append(now)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response

@app.get("/api/health")
async def health():
    return {"status": "ok", "offline_analysis": True}

# In-memory storage for active incidents
incidents_store: Dict[str, Dict[str, Any]] = {}

# Pydantic schema for triggering incidents
class TriggerIncidentRequest(BaseModel):
    scenario: Literal["latency_spike", "error_spike", "cpu_throttling"]  # 'latency_spike' or 'error_spike'

# Pydantic schema for approving a specific remediation option
class ApproveRemediationRequest(BaseModel):
    action_type: str = ""
    target: str = ""
    value: str = ""
    title: str = ""

# WebSocket Connection Manager for real-time streaming
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, incident_id: str, websocket: WebSocket):
        await websocket.accept()
        if incident_id not in self.active_connections:
            self.active_connections[incident_id] = []
        self.active_connections[incident_id].append(websocket)
        logger.info(f"WebSocket client connected to incident: {incident_id}")

    def disconnect(self, incident_id: str, websocket: WebSocket):
        if incident_id in self.active_connections:
            if websocket in self.active_connections[incident_id]:
                self.active_connections[incident_id].remove(websocket)
            if not self.active_connections[incident_id]:
                del self.active_connections[incident_id]
        logger.info(f"WebSocket client disconnected from incident: {incident_id}")

    async def broadcast(self, incident_id: str, message: dict):
        if incident_id in self.active_connections:
            logger.info(f"Broadcasting event to {len(self.active_connections[incident_id])} clients for {incident_id}")
            # Gather tasks and run them concurrently
            connections = list(self.active_connections[incident_id])
            results = await asyncio.gather(
                *(asyncio.wait_for(c.send_json(message), timeout=5) for c in connections),
                return_exceptions=True,
            )
            for connection, result in zip(connections, results):
                if isinstance(result, BaseException):
                    self.disconnect(incident_id, connection)

manager = ConnectionManager()

# Helper to execute the graph and stream events
async def run_incident_flow(incident_id: str, state: AgentState):
    graph = get_graph(resume=state.get("remediation_status") in {"approved", "rejected"})
    state = copy.deepcopy(state)
    try:
        # Run using LangGraph async streaming
        async for event in graph.astream(state):
            # event is a dictionary, e.g., {"triage": {...updated state...}}
            node_name = list(event.keys())[0]
            node_state = event[node_name]
            
            # Merge state changes into store
            current_store = incidents_store[incident_id]
            for key, val in node_state.items():
                # Nodes return complete snapshots, not append-only deltas.
                current_store[key] = copy.deepcopy(val)
            
            # Broadcast the updated state
            serialized = serialize_state(current_store)
            await manager.broadcast(incident_id, {
                "type": "state_update",
                "node": node_name,
                "state": serialized
            })
            
            # Artificial sleep to allow visual transition on frontend
            await asyncio.sleep(1.5)
            
            # If the graph has requested human approval, we exit execution loop here
            if current_store.get("user_approval_needed"):
                logger.info(f"Incident {incident_id} is awaiting Human-in-the-Loop action.")
                break
                
    except Exception as e:
        logger.error("Incident flow failed (%s)", type(e).__name__)
        incidents_store[incident_id]["remediation_status"] = "failed"
        # Send error broadcast
        await manager.broadcast(incident_id, {
            "type": "error",
            "message": "Incident processing failed; inspect server diagnostics."
        })

class ValidateKeyRequest(BaseModel):
    provider: Literal["gemini", "groq", "cohere", "huggingface", "openrouter"]
    api_key: str = Field(min_length=1, max_length=512, repr=False)

@app.post("/api/validate-key")
async def validate_key_endpoint(req: ValidateKeyRequest):
    api_key = req.api_key.strip()
    provider = detect_provider_from_key(api_key, req.provider.lower())
    
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key cannot be empty.")
        
    is_valid = False
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            if "gemini" in provider:
                url = "https://generativelanguage.googleapis.com/v1beta/models"
                resp = await client.get(url, headers={"x-goog-api-key": api_key}, timeout=5)
                is_valid = (resp.status_code == 200)
            elif "groq" in provider:
                headers = {"Authorization": f"Bearer {api_key}"}
                resp = await client.get("https://api.groq.com/openai/v1/models", headers=headers, timeout=5)
                is_valid = (resp.status_code == 200)
            elif "cohere" in provider:
                headers = {"Authorization": f"Bearer {api_key}"}
                resp = await client.get("https://api.cohere.com/v1/models", headers=headers, timeout=5)
                is_valid = (resp.status_code == 200)
            elif "hugging" in provider or "hf" in provider:
                headers = {"Authorization": f"Bearer {api_key}"}
                resp = await client.get("https://huggingface.co/api/whoami-v2", headers=headers, timeout=5)
                is_valid = (resp.status_code == 200)
            elif "openrouter" in provider:
                headers = {
                    "Authorization": f"Bearer {api_key}",
                    "HTTP-Referer": "http://localhost:3000",
                    "X-Title": "DevPulse AI"
                }
                resp = await client.get("https://openrouter.ai/api/v1/auth/key", headers=headers, timeout=5)
                is_valid = (resp.status_code == 200)
            else:
                is_valid = False
    except Exception as e:
        logger.warning("Key validation failed (%s)", type(e).__name__)
        is_valid = False
        
    if is_valid:
        return {"status": "ok", "message": "Connection established successfully!"}
    else:
        raise HTTPException(status_code=400, detail="Invalid API Key. Connection failed.")

class AnalyzeRequest(BaseModel):
    code_content: str = Field(min_length=1, max_length=100_000)
    language: Literal["python", "javascript", "typescript", "java", "cpp", "go", "rust", "c", "c++", "js"] = "python"
    gemini_api_key: str = Field(default="", max_length=512, repr=False)
    provider: Literal["auto", "local", "gemini", "groq", "cohere", "huggingface", "openrouter"] = "auto"

@app.post("/api/analyze")
async def analyze_code_endpoint(req: AnalyzeRequest):
    try:
        results = await run_devpulse_analysis(req.code_content, req.language, req.gemini_api_key, req.provider)
        return results
    except Exception as e:
        logger.error("Analysis failed (%s)", type(e).__name__)
        raise HTTPException(status_code=502, detail="Analysis provider failed. Try offline mode or check server configuration.") from None

@app.post("/api/incidents/trigger")
async def trigger_incident(req: TriggerIncidentRequest, background_tasks: BackgroundTasks):
    scenario = req.scenario
    if scenario not in ["latency_spike", "error_spike", "cpu_throttling"]:
        raise HTTPException(status_code=400, detail="Invalid scenario name")
        
    if len(incidents_store) >= 100:
        finished = next((key for key, value in incidents_store.items() if value.get("remediation_status") in {"executed", "rejected", "failed"}), None)
        if finished is None:
            raise HTTPException(status_code=429, detail="Active incident limit reached")
        del incidents_store[finished]
    incident_id = str(uuid.uuid4())
    if scenario == "latency_spike":
        alert_name = "High Latency on Payment-Service"
    elif scenario == "cpu_throttling":
        alert_name = "Severe CPU Throttling on API-Gateway"
    else:
        alert_name = "High Error Rate on Auth-Service"
    
    # Initialize the base state
    initial_state: AgentState = {
        "incident_id": incident_id,
        "alert_name": alert_name,
        "service": "",
        "symptoms": "",
        "messages": [],
        "splunk_queries": [],
        "diagnosis": "",
        "proposed_remediation": {},
        "remediation_status": "pending",
        "current_node": "",
        "user_approval_needed": False,
        "audit_logs": []
    }
    
    incidents_store[incident_id] = initial_state
    
    # Run graph in the background so API responds instantly
    background_tasks.add_task(run_incident_flow, incident_id, initial_state)
    
    return {"incident_id": incident_id, "status": "triggered", "alert_name": alert_name}

@app.get("/api/incidents")
def list_incidents():
    return [
        {
            "incident_id": idx,
            "alert_name": item.get("alert_name"),
            "service": item.get("service"),
            "status": item.get("remediation_status"),
            "current_node": item.get("current_node")
        }
        for idx, item in incidents_store.items()
    ]

@app.get("/api/incidents/{incident_id}")
def get_incident(incident_id: str):
    if incident_id not in incidents_store:
        raise HTTPException(status_code=404, detail="Incident not found")
    return serialize_state(incidents_store[incident_id])

@app.post("/api/incidents/{incident_id}/approve")
async def approve_remediation(incident_id: str, req: ApproveRemediationRequest, background_tasks: BackgroundTasks):
    if incident_id not in incidents_store:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    state = incidents_store[incident_id]
    if not state.get("user_approval_needed"):
        raise HTTPException(status_code=400, detail="Incident is not waiting for approval")
        
    options = state.get("proposed_remediation", {}).get("options", [])
    selected = next((option for option in options if all(option.get(k, "") == getattr(req, k) for k in ("action_type", "target", "value"))), None) if req.action_type else (options[0] if options else None)
    if selected is None:
        raise HTTPException(status_code=400, detail="Only a proposed remediation option may be approved")
    state["user_approval_needed"] = False
    state["remediation_status"] = "approved"
    state["proposed_remediation"]["selected_option"] = copy.deepcopy(selected)
    log_text = "Operator approved a proposed remediation option."

    # Log approval message
    state["messages"].append(HumanMessage(content=log_text, name="User"))
    
    # Resume graph execution in the background
    background_tasks.add_task(run_incident_flow, incident_id, state)
    
    return {"status": "approved", "incident_id": incident_id}

@app.post("/api/incidents/{incident_id}/reject")
async def reject_remediation(incident_id: str, background_tasks: BackgroundTasks):
    if incident_id not in incidents_store:
        raise HTTPException(status_code=404, detail="Incident not found")
        
    state = incidents_store[incident_id]
    if not state.get("user_approval_needed"):
        raise HTTPException(status_code=400, detail="Incident is not waiting for approval")
        
    # Update state
    state["user_approval_needed"] = False
    state["remediation_status"] = "rejected"
    
    # Log rejection message
    state["messages"].append(HumanMessage(content="Action Rejected by SRE Operator.", name="User"))
    
    # Resume graph execution in the background
    background_tasks.add_task(run_incident_flow, incident_id, state)
    
    return {"status": "rejected", "incident_id": incident_id}

@app.websocket("/ws/incidents/{incident_id}")
async def websocket_endpoint(websocket: WebSocket, incident_id: str):
    expected = os.getenv("DEVPULSE_API_TOKEN", "")
    if expected and not secrets.compare_digest(websocket.headers.get("authorization", ""), "Bearer " + expected):
        await websocket.close(code=1008)
        return
    origin = websocket.headers.get("origin")
    allowed = os.getenv("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000").split(",")
    if origin and origin not in allowed:
        await websocket.close(code=1008)
        return
    if incident_id not in incidents_store:
        await websocket.close(code=1008)
        return
    if len(manager.active_connections.get(incident_id, [])) >= 10:
        await websocket.close(code=1013)
        return
    await manager.connect(incident_id, websocket)
    
    # Immediately send the current state if it exists
    if incident_id in incidents_store:
        await websocket.send_json({
            "type": "state_update",
            "node": incidents_store[incident_id].get("current_node", ""),
            "state": serialize_state(incidents_store[incident_id])
        })
        
    try:
        while True:
            # Keep the socket open and listen for messages (currently we only push)
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(incident_id, websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host=os.getenv("BACKEND_HOST", "127.0.0.1"), port=8000, reload=True)
