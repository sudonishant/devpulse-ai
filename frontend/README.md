# Frontend

Next.js dashboard. Follow the repository-root README for setup and security requirements.

- `npm ci --ignore-scripts`
- `npm run dev -- --hostname 127.0.0.1`
- `npm run lint -- --max-warnings=0`
- `npm run build`

Browser API calls use `/api/...`. The server-only proxy uses `BACKEND_INTERNAL_URL` (default `http://127.0.0.1:8000`). Never use `NEXT_PUBLIC_*` for credentials. Optional provider keys stay in React memory; no API key is required for limited offline static analysis. Incident updates use same-origin polling.

The authenticated production deployment boundary and remaining dev dependency advisory are documented in `../SECURITY.md`.
