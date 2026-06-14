import os
import uuid
import logging
from typing import Dict, List, Any
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import asyncio

# Import agents and state graph
from backend.agents.graph import get_graph, AgentState, serialize_state
from langchain_core.messages import AIMessage, HumanMessage
from backend.devpulse import analyze_code as run_devpulse_analysis

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger("main_server")

app = FastAPI(title="DevPulse AI API Server", version="1.0.0")

# CORS setup for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# In-memory storage for active incidents
incidents_store: Dict[str, Dict[str, Any]] = {}

# Pydantic schema for triggering incidents
class TriggerIncidentRequest(BaseModel):
    scenario: str  # 'latency_spike' or 'error_spike'

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
            self.active_connections[incident_id].remove(websocket)
            if not self.active_connections[incident_id]:
                del self.active_connections[incident_id]
        logger.info(f"WebSocket client disconnected from incident: {incident_id}")

    async def broadcast(self, incident_id: str, message: dict):
        if incident_id in self.active_connections:
            logger.info(f"Broadcasting event to {len(self.active_connections[incident_id])} clients for {incident_id}")
            # Gather tasks and run them concurrently
            tasks = [
                connection.send_json(message)
                for connection in self.active_connections[incident_id]
            ]
            await asyncio.gather(*tasks, return_exceptions=True)

manager = ConnectionManager()

# Helper to execute the graph and stream events
async def run_incident_flow(incident_id: str, state: AgentState):
    graph = get_graph()
    
    try:
        # Run using LangGraph async streaming
        async for event in graph.astream(state):
            # event is a dictionary, e.g., {"triage": {...updated state...}}
            node_name = list(event.keys())[0]
            node_state = event[node_name]
            
            # Merge state changes into store
            current_store = incidents_store[incident_id]
            for key, val in node_state.items():
                if key == "messages":
                    # Append new messages
                    current_store["messages"].extend(val)
                else:
                    current_store[key] = val
            
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
        logger.exception(f"Error running incident {incident_id}: {e}")
        # Send error broadcast
        await manager.broadcast(incident_id, {
            "type": "error",
            "message": str(e)
        })

class ValidateKeyRequest(BaseModel):
    provider: str
    api_key: str

@app.post("/api/validate-key")
async def validate_key_endpoint(req: ValidateKeyRequest):
    provider = req.provider.lower()
    api_key = req.api_key.strip()
    
    if not api_key:
        raise HTTPException(status_code=400, detail="API Key cannot be empty.")
        
    is_valid = False
    try:
        import httpx
        async with httpx.AsyncClient() as client:
            if "gemini" in provider:
                url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
                resp = await client.get(url, timeout=5)
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
            else:
                is_valid = len(api_key) > 15
    except Exception as e:
        logger.error(f"Error validating key: {e}")
        is_valid = False
        
    if is_valid:
        return {"status": "ok", "message": "Connection established successfully!"}
    else:
        raise HTTPException(status_code=400, detail="Invalid API Key. Connection failed.")

class AnalyzeRequest(BaseModel):
    code_content: str
    language: str = "python"
    gemini_api_key: str = ""
    provider: str = "gemini"

@app.post("/api/analyze")
async def analyze_code_endpoint(req: AnalyzeRequest):
    try:
        results = await run_devpulse_analysis(req.code_content, req.language, req.gemini_api_key, req.provider)
        return results
    except Exception as e:
        logger.exception(f"Error analyzing code: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/incidents/trigger")
async def trigger_incident(req: TriggerIncidentRequest, background_tasks: BackgroundTasks):
    scenario = req.scenario
    if scenario not in ["latency_spike", "error_spike", "cpu_throttling"]:
        raise HTTPException(status_code=400, detail="Invalid scenario name")
        
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
        
    # Update state
    state["user_approval_needed"] = False
    state["remediation_status"] = "approved"
    
    if req.action_type:
        state["proposed_remediation"]["selected_option"] = {
            "action_type": req.action_type,
            "target": req.target,
            "value": req.value
        }
        log_text = f"Action Approved by SRE Operator: {req.title or req.value}."
    else:
        log_text = "Action Approved by SRE Operator (Default Remedy)."
        
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
        manager.disconnect(incident_id, websocket)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
