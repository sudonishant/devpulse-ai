# DevPulse AI

DevPulse AI is a local FastAPI + Next.js hackathon/demo application with two workflows:

- **Code audit:** submit a code snippet to concurrent security and performance prompts backed by a selected LLM provider.
- **Incident-room simulation:** trigger one of three predefined incidents; a LangGraph workflow queries the local mock Splunk MCP server, pauses for approval, and records simulated remediation.

This is not a production security scanner or autonomous production-remediation service. Review and test every model result and recommendation.

## Current implementation

- `POST /api/analyze` runs security and performance provider calls concurrently. Backend branches support Gemini, Groq, Cohere, Hugging Face, and OpenRouter.
- `POST /api/validate-key` performs provider-specific key validation requests.
- `POST /api/incidents/trigger` accepts `latency_spike`, `error_spike`, or `cpu_throttling`.
- Incident state is held in memory. The incident workflow uses `backend/mcp/mock_splunk.py`, not a live Splunk service, and pauses before simulated remediation.
- The Next.js UI provides a code textarea, language selector, audit results, report download, incident status, and provider-key settings.

The “GitHub Repository Target” field is currently visual-only: it does not fetch or clone a repository. The special `demo_mode_bypass` value returns hard-coded frontend results and does not audit code.

## Architecture

```text
Browser (Next.js :3000)
  ├─ /api/analyze, /api/validate-key ── FastAPI (uvicorn :8000)
  │                                      └─ devpulse.py ── external LLM provider
  ├─ /api/incidents/*, WebSocket ────── agents/graph.py
  │                                      └─ mcp/client.py ── mock_splunk.py + SQLite
  └─ local UI
```

The mock server creates ignored demo data under `backend/mcp/` (`hackathon.db` and `code_repo/`). It does not connect to or modify your infrastructure.

## Requirements

- Python 3.10+
- Node.js compatible with the installed Next.js 16 package (Node 20+ recommended)
- npm

A provider key is required for live code audits. No live Splunk instance is required for the incident simulator.

## Quick start

From the repository root, use two terminals.

### Backend

```bash
python3 -m venv .venv
. .venv/bin/activate
python -m pip install -r backend/requirements.txt
python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev -- -p 3000
```

Open `http://127.0.0.1:3000`. The API docs are at `http://127.0.0.1:8000/docs`.

`run.sh` is optional and assumes an existing `backend/venv/bin/python`; it kills processes on ports 8000 and 3000, binds the backend to `0.0.0.0`, and writes log files. The manual commands are safer for development.

## Environment variables and keys

The backend reads these names (values are intentionally omitted):

- `GEMINI_API_KEY` or `GOOGLE_API_KEY`
- `GROQ_API_KEY`
- `COHERE_API_KEY`
- `HUGGINGFACE_API_KEY` or `HF_API_KEY`
- `OPENROUTER_API_KEY` or `OR_API_KEY`
- `OPENROUTER_KEYS` (comma-separated fallback pool)

The frontend can send a key from Settings. It stores that value in browser `localStorage` under `devpulse_gemini_api_key`, even when another provider is selected, and sends it in the `/api/analyze` body. Use a disposable development key and clear site storage afterward. Submitted code is sent to the selected external provider; remove secrets and personal data first.

## API examples

### Live code audit

```bash
curl -sS http://127.0.0.1:8000/api/analyze \
  -H 'Content-Type: application/json' \
  -d '{"code_content":"def add(a, b):\n    return a + b","language":"python","provider":"gemini"}'
```

Request fields are `code_content`, `language`, `gemini_api_key` (a compatibility name that may contain another provider key), and `provider`. Without a usable key, this endpoint returns an error; there is no offline fallback for code audits.

### Incident simulation

```bash
curl -sS http://127.0.0.1:8000/api/incidents/trigger \
  -H 'Content-Type: application/json' -d '{"scenario":"latency_spike"}'
curl -sS http://127.0.0.1:8000/api/incidents
curl -sS http://127.0.0.1:8000/api/incidents/<incident_id>
```

Connect to `ws://127.0.0.1:8000/ws/incidents/<incident_id>` for state updates. When `user_approval_needed` is true, continue the simulation with either:

```bash
curl -sS -X POST http://127.0.0.1:8000/api/incidents/<incident_id>/approve \
  -H 'Content-Type: application/json' \
  -d '{"action_type":"scale_deployment","target":"api-gateway-deployment","value":"5","title":"Demo approval"}'
# Or: curl -sS -X POST http://127.0.0.1:8000/api/incidents/<incident_id>/reject
```

The approval gate is a demo control, not authentication or authorization. Simulated telemetry and remediation do not affect a real cluster, database, repository, or Splunk instance.

## Project map

```text
backend/main.py              # FastAPI routes, incidents, WebSocket updates
backend/devpulse.py          # Provider calls and audit result shaping
backend/agents/graph.py      # Incident LangGraph and approval pause
backend/mcp/client.py        # JSON-RPC subprocess client
backend/mcp/mock_splunk.py   # Local telemetry/remediation simulator
backend/mcp/security.py      # SPL guardrails
frontend/src/app/page.tsx    # Main UI and browser API calls
frontend/src/app/globals.css # UI styles
run.sh                       # Convenience launcher with extra assumptions
devpost_story.md             # Hackathon narrative
```

## Checks

```bash
# repository root
python3 -m compileall -q backend
# frontend directory
npm run lint
npm run build
```

There is no checked-in automated test suite. Static checks do not prove provider access or a running frontend/backend connection.

## Security and privacy

- Never commit `.env`, provider keys, `backend/openrouter_keys.json`, generated logs, or the ignored mock database.
- CORS is currently permissive (`allow_origins=["*"]`) and the API has no authentication. Keep the backend bound to localhost.
- Treat generated patches, severity counts, health scores, performance percentages, and remediation plans as unverified model/demo output.
- Incident state is process-local and disappears on restart; this is not a durable or multi-user service.

## License

No license file is currently tracked. Check with the project owner before redistributing this code.
