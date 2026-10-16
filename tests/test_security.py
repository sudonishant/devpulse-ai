import asyncio
import copy
import os
import sys
import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage

from backend import main
from backend import devpulse
from backend.agents import graph
from backend.local_analysis import analyze_local
from backend.mcp.client import SplunkMCPClient
from backend.mcp.security import validate_spl


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    for name in ("DEVPULSE_API_TOKEN", "DEVPULSE_ENV", "OPENROUTER_API_KEY", "OPENROUTER_KEYS", "OR_API_KEY", "GEMINI_API_KEY", "GOOGLE_API_KEY", "GROQ_API_KEY", "COHERE_API_KEY", "HF_API_KEY", "HUGGINGFACE_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    main.request_windows.clear()
    main.incidents_store.clear()
    monkeypatch.setattr(devpulse, "load_openrouter_keys", lambda: [])
    monkeypatch.setattr(graph, "run_agent_reasoning", lambda _s, _u, fallback: fallback)
    yield
    if graph.mcp_client is not None:
        graph.mcp_client.close()
        graph.mcp_client = None


def incident_state():
    return {"incident_id": "test-incident", "alert_name": "High Latency on Payment-Service", "service": "payment-service", "symptoms": "slow", "messages": [], "splunk_queries": [], "diagnosis": "missing index", "proposed_remediation": {}, "remediation_status": "pending", "current_node": "", "user_approval_needed": False, "audit_logs": []}


def test_offline_analysis_without_key():
    with TestClient(main.app) as client:
        response = client.post("/api/analyze", json={"code_content": "eval(user_input)"})
    assert response.status_code == 200
    data = response.json()
    assert data["analysis_mode"] == "local-static"
    assert data["security_alerts"] == 1
    assert data["performance_boost"] == 0
    assert data["refactored_code"] == "eval(user_input)"


@pytest.mark.parametrize("payload", [{"code_content": ""}, {"code_content": "x", "provider": "made-up"}, {"code_content": "x", "language": "(evil)"}])
def test_invalid_analysis_input(payload):
    with TestClient(main.app) as client:
        assert client.post("/api/analyze", json=payload).status_code == 422


def test_body_limit_and_rate_limit():
    with TestClient(main.app) as client:
        assert client.post("/api/analyze", content=b"x" * 250001).status_code == 413
        for _ in range(60):
            assert client.get("/api/health").status_code == 200
        assert client.get("/api/health").status_code == 429


def test_chunked_body_limit():
    with TestClient(main.app) as client:
        response = client.post("/api/analyze", content=iter([b"x" * 150000, b"y" * 150000]))
        assert response.status_code == 413


def test_authorization(monkeypatch):
    monkeypatch.setenv("DEVPULSE_API_TOKEN", "test-only-token")
    with TestClient(main.app) as client:
        assert client.get("/api/incidents").status_code == 401
        assert client.get("/api/incidents", headers={"Authorization": "Bearer test-only-token"}).status_code == 200


def test_production_fail_closed(monkeypatch):
    monkeypatch.setenv("DEVPULSE_ENV", "production")
    with pytest.raises(RuntimeError, match="Production requires"):
        with TestClient(main.app):
            pass


def test_cors_not_wildcard():
    with TestClient(main.app) as client:
        response = client.options("/api/analyze", headers={"Origin": "https://attacker.invalid", "Access-Control-Request-Method": "POST"})
        assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize("query", ["", "index=app | delete", "index=app [| outputlookup foo]", "index=app | `macro`", "index=app; drop", "search *", "index=app | unknown", "index=app |", "| inputlookup anything"])
def test_spl_fail_closed(query):
    assert validate_spl(query)[0] is False


def test_valid_spl():
    assert validate_spl("index=apm service=payment-service | stats avg(duration_ms) as avg_duration by operation | sort -avg_duration")[0]


def test_arbitrary_sql_approval_rejected(monkeypatch):
    state = graph.remediation_node(incident_state())
    main.incidents_store["test-incident"] = state
    with TestClient(main.app) as client:
        response = client.post("/api/incidents/test-incident/approve", json={"action_type": "execute_sql", "target": "postgres-db", "value": "DROP TABLE payment_methods;"})
        assert response.status_code == 400
        assert state["user_approval_needed"] is True
        assert state["remediation_status"] == "pending"


def test_resume_does_not_repeat_triage_or_duplicate_messages(monkeypatch):
    async def no_delay(_):
        pass
    monkeypatch.setattr(main.asyncio, "sleep", no_delay)
    state = incident_state()
    main.incidents_store[state["incident_id"]] = state
    asyncio.run(main.run_incident_flow(state["incident_id"], state))
    waiting = main.incidents_store[state["incident_id"]]
    assert [m.name for m in waiting["messages"]] == ["TriageAgent", "DiagnosticianAgent", "RemediationAgent"]
    with TestClient(main.app) as client:
        assert client.post("/api/incidents/test-incident/approve", json={}).status_code == 200
        final = main.incidents_store["test-incident"]
        assert final["remediation_status"] == "executed"
        assert [m.name for m in final["messages"]].count("TriageAgent") == 1
        assert len(final["messages"]) == 6
        assert client.post("/api/incidents/test-incident/approve", json={}).status_code == 400


def test_remediation_failure_not_reported_as_success(monkeypatch):
    state = graph.remediation_node(incident_state())
    state["remediation_status"] = "approved"
    class FailedClient:
        def call_tool(self, *_):
            return {"success": False, "message": "failed"}
    monkeypatch.setattr(graph, "get_mcp_client", lambda: FailedClient())
    result = graph.remediation_node(state)
    assert result["remediation_status"] == "failed"
    assert "failed" in result["messages"][-1].content


def test_provider_failure_not_disclosed(monkeypatch):
    async def fail(*args):
        raise RuntimeError("private provider debug information")
    monkeypatch.setattr(main, "run_devpulse_analysis", fail)
    with TestClient(main.app) as client:
        response = client.post("/api/analyze", json={"code_content": "x"})
        assert response.status_code == 502
        assert "private provider" not in response.text


def test_no_fabricated_boost_or_keyword_substring_alerts():
    assert devpulse.compute_health_and_stats("", "No HIGH vulnerabilities. Workflow is safe.", "boost 95%") == (100, 0, 0)
    assert devpulse.extract_refactored_code("```c++\nint main() {}\n```", "c++") == "int main() {}"


def test_env_provider_resolution(monkeypatch):
    monkeypatch.setenv("OR_API_KEY", "test-credential")
    assert devpulse.resolve_credentials(None, "auto") == ("openrouter", "test-credential")
    assert devpulse.resolve_credentials(None, "local") == ("local", "")


def test_mcp_tool_boundary_rejects_sql_and_unknown_actions():
    client = SplunkMCPClient()
    try:
        for action in [{"action_type": "execute_sql", "target": "postgres-db", "value": "DROP TABLE payment_methods;"}, {"action_type": "shell", "target": "anything"}]:
            assert client.call_tool("execute_remediation", action)["success"] is False
        with pytest.raises(RuntimeError):
            client.call_tool("run_splunk_query", {"query": "index=app | delete"})
    finally:
        client.close()


def test_mcp_timeout_on_partial_line(tmp_path):
    server = tmp_path / "partial.py"
    server.write_text("import sys,time\nsys.stdout.write('{');sys.stdout.flush();time.sleep(30)\n")
    started = time.monotonic()
    with pytest.raises(TimeoutError):
        SplunkMCPClient(str(server))
    assert time.monotonic() - started < 15


def test_mcp_concurrent_request_ids():
    from concurrent.futures import ThreadPoolExecutor
    client = SplunkMCPClient()
    try:
        with ThreadPoolExecutor(max_workers=4) as executor:
            results = list(executor.map(lambda _: client.list_tools(), range(12)))
        assert all(any(tool["name"] == "execute_remediation" for tool in tools) for tools in results)
    finally:
        client.close()


def test_local_syntax_and_secret_location_only():
    assert "syntax error" in analyze_local("def broken(", "python")["security_report"]
    result = analyze_local("password = 'example-only-value'", "python")
    assert result["security_alerts"] == 1
    assert "example-only-value" not in result["security_report"]


def test_validation_response_never_echoes_key():
    secret = "sensitive-input-value" * 30
    with TestClient(main.app) as client:
        response = client.post("/api/validate-key", json={"provider": "gemini", "api_key": secret})
        assert response.status_code == 422
        assert secret not in response.text


def test_websocket_auth_and_unknown_incident(monkeypatch):
    from starlette.websockets import WebSocketDisconnect
    monkeypatch.setenv("DEVPULSE_API_TOKEN", "test-only-token")
    with TestClient(main.app) as client:
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/incidents/not-found"):
                pass
        with pytest.raises(WebSocketDisconnect):
            with client.websocket_connect("/ws/incidents/not-found", headers={"Authorization": "Bearer test-only-token"}):
                pass


def test_rejection_resume_does_not_retriage(monkeypatch):
    async def no_delay(_):
        pass
    monkeypatch.setattr(main.asyncio, "sleep", no_delay)
    state = graph.remediation_node(incident_state())
    main.incidents_store["test-incident"] = state
    with TestClient(main.app) as client:
        assert client.post("/api/incidents/test-incident/reject").status_code == 200
        result = main.incidents_store["test-incident"]
        assert result["remediation_status"] == "rejected"
        assert not any(msg.name == "TriageAgent" for msg in result["messages"])


def test_mcp_query_type_routing():
    client = SplunkMCPClient()
    try:
        vcs = client.call_tool("generate_spl", {"question": "show git VCS commits for payment-service"})
        assert vcs["spl"].startswith("index=vcs")
        assert client.call_tool("run_splunk_query", {"query": vcs["spl"]})["results"]
        k8s = client.call_tool("generate_spl", {"question": "show kubernetes pod status for payment-service"})
        assert k8s["spl"].startswith("index=infrastructure")
    finally:
        client.close()


def test_cancel_sibling_provider_on_failure(monkeypatch):
    cancelled = []
    async def security(*_):
        await asyncio.sleep(0.01)
        raise RuntimeError("Provider failed")
    async def performance(*_):
        try:
            await asyncio.sleep(30)
        except asyncio.CancelledError:
            cancelled.append(True)
            raise
    monkeypatch.setattr(devpulse, "run_security_agent", security)
    monkeypatch.setattr(devpulse, "run_performance_agent", performance)
    with pytest.raises(ExceptionGroup):
        asyncio.run(devpulse.analyze_code("x", api_key="test-only-credential", provider="groq"))
    assert cancelled == [True]
