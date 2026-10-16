# DevPulse AI — audited development build

A Next.js code-review dashboard with a FastAPI backend and a simulated SRE incident workflow. **This is a prototype, not a production security certification.** See [AUDIT_REPORT.md](AUDIT_REPORT.md) for the findings, changes, evidence and remaining limitations.

## Run without an API key

Requires Python 3.13, Node.js 22+, npm, and Linux/macOS (the optional launcher uses Linux `setsid`). Python 3.11+ syntax is used; the locked environment was tested on Python 3.13.

```bash
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.lock.txt
cd frontend
npm ci --ignore-scripts
cd ..
./run.sh
```

Open http://localhost:3000. The launcher binds both services to loopback by default. It does not kill unrelated processes. If your platform lacks `setsid`, start the services in two terminals:

```bash
# Terminal 1, repository root
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
# Terminal 2
cd frontend
npm run dev -- --hostname 127.0.0.1 --port 3000
```

`requirements.lock.txt` captures the entire tested Python environment, including tests/audit tooling; `requirements.txt` pins direct runtime dependencies only.

### Analysis modes

- **No credentials:** `local-static` mode. Limited Python AST checks and simple secret-assignment patterns; submitted code is never executed. Other languages get only basic text checks. False positives and false negatives are expected. Output code is unchanged and speedup is unmeasured.
- **Optional server credentials:** set an environment variable such as `OPENROUTER_API_KEY` or `GEMINI_API_KEY`. Requests use configured AI providers and are labelled `live-llm`. Code is sent to that external provider; check your privacy requirements first.
- **Optional browser-supplied key:** retained in React memory only, never persisted to browser storage. Same-origin proxy only; reload clears the key. Use HTTPS outside loopback. No key entry is required to use offline mode.
- **Explicit canned demo:** the optional Demo button loads a prewritten sample, not an analysis of the submitted code. It is labelled `canned-demo`.

All scores are heuristic. No measured performance gain is claimed. Neither model output nor local findings establish that code is safe.

## Optional configuration

Copy `.env.example` to `.env` at the repository root only if needed. Never commit credentials. FastAPI loads it with python-dotenv. For a separate backend origin, copy `frontend/.env.example` to `frontend/.env.local` and set the **server-side** `BACKEND_INTERNAL_URL`. Restart after configuration changes. Never put keys in `NEXT_PUBLIC_*` variables.

Supported server variables include `OPENROUTER_API_KEY`, `OR_API_KEY`, `OPENROUTER_KEYS` (comma separated), `GEMINI_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `COHERE_API_KEY`, `HUGGINGFACE_API_KEY`, and `HF_API_KEY`. Model IDs are configurable through `OPENROUTER_MODEL`, `GEMINI_MODEL`, `GROQ_MODEL`, `COHERE_MODEL`, and `HF_MODEL`. Provider availability was not live-tested; no real credential is included.

### Deployment boundary — important

Do not publish an unauthenticated deployment with paid server credentials. Set `DEVPULSE_ENV=production` and `DEVPULSE_API_TOKEN` on the backend. Production startup refuses a missing token. An authenticated reverse proxy/gateway must forward `Authorization: Bearer <token>` for authorized requests; the Next.js route forwards incoming authorization but **does not inject a privileged token into public requests**. There is no built-in end-user login/token-entry UI. Setting production auth without gateway integration intentionally makes ordinary unauthenticated dashboard API calls return 401.

Set an explicit `CORS_ORIGINS` list only for required direct backend consumers. Prefer a private backend and same-origin Next API proxy. For remote development without paid credentials, `FRONTEND_HOST=0.0.0.0 ./run.sh` exposes the frontend while the backend stays private. Changing the backend port requires a matching `BACKEND_INTERNAL_URL`.

The in-process limits and storage are for a single-process demo. Production still needs real identity/RBAC, persistent storage, a durable job queue, tenant isolation, distributed quotas and deployment hardening. See [SECURITY.md](SECURITY.md).

## Incident workflow

The three scenarios are `latency_spike`, `error_spike`, and `cpu_throttling`. Telemetry and infrastructure are simulated. The MCP subprocess can create an allowlisted index in a **local SQLite demo database** and edit predefined **local mock files**. It does not connect to production Splunk, PostgreSQL, Kubernetes, Git hosting or Slack. Scaling and ChatOps messages are simulations.

Trigger an incident with `POST /api/incidents/trigger`, inspect it at `/incidents/<id>`, and approve only an option proposed by the server. Approval resumes at remediation rather than repeating triage. Rejected or failed actions are not reported as successful. The incident page uses same-origin polling; the optional backend WebSocket endpoint requires the configured auth/origin policy.

## Verification

```bash
.venv/bin/python -m pytest -q
.venv/bin/pip check
.venv/bin/pip-audit
python3 scripts/scan_secrets.py .
cd frontend
npm run lint -- --max-warnings=0
npm run build
npm audit --omit=dev --audit-level=low
```

At the recorded audit: 34 backend/security tests passed; lint, TypeScript and production build passed; no known production npm or resolved Python advisories were reported. Full npm audit still reported five **dev-only** high findings in one ESLint dependency chain; see SECURITY.md. Database advisory results change over time.

The secret scanner examines fetched reachable Git history only and emits locations, never values. It is not an exhaustive secret detector. Enable host secret scanning/push protection and use an established scanner too. Historical pitch material in `devpost_story.md` is not authoritative documentation of verified functionality.
