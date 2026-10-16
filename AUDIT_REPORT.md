# DevPulse AI — Security, Bug Fix & Public Repo Leak Report

**Audit date:** 16 October 2026
**Target:** https://github.com/sudonishant/devpulse-ai
**Original HEAD:** `e46aed0`
**Delivery:** audited source, Git diff and evidence; follow-up delivery branch: `security/audit-fixes-20261016`. Default branch is not directly overwritten. The initial report was local-only; the owner subsequently authorized a PAT-based branch push.

## 1. Seedha conclusion

- Aapne chat mein jo API key bheji, use **exposed** maan kar provider dashboard se revoke/rotate karein. Is report, code, logs ya test mein us key ko use/repeat nahi kiya gaya. Key ka active/billing status check nahi kiya gaya.
- `devpulse-ai` ke original fetched history mein **18 commits / 73 unique blobs** ke configured secret patterns par **zero candidates** mile. Iska matlab “repo completely secret-free” nahi hai.
- Aapke account ke **23 public repos** ka broader pattern scan hua: **426 reachable commits / 3,016 blobs / 15 raw candidate occurrences**, chaar repos mein. Reviewed matches Firebase client config, historical mock test strings, HTML key placeholders aur binary string markers hain—**koi usable private credential confirm nahi kiya gaya**. Detailed table `PUBLIC_REPO_SCAN.md` mein hai.
- DevPulse code mein security, incident-state aur misleading-output issues fix kiye gaye. API key maange bina limited offline analysis available hai.
- Original npm audit: **15 findings — 1 critical, 12 high, 2 moderate**. Updated full audit: **5 high, dev-only, ek dependency chain**. Production-only audit: **0 known findings**. Python resolved-environment audit: **0 known findings**.
- **34 regression tests pass**, frontend lint **zero warnings/errors**, TypeScript/build pass, aur six HTTP/proxy smoke checks pass.
- **“Sab issues permanently fix / production-ready / leak-free” ka claim nahi hai.** Remaining deployment and coverage gaps section 7 mein hain.

## 2. Scope aur method

Public clone ko locally inspect kiya; original repo history, backend routes, agent graph, MCP subprocess/tools, frontend pages, launcher aur dependencies review hue. Public GitHub issues endpoint se available result **empty list** tha: code findings GitHub issue tickets nahi hain. Initial audit mein GitHub write connector available nahi tha, isliye changes local the. Follow-up mein owner ki explicit permission par PAT se authenticated permission check aur separate-branch publication ki gayi; token source/config mein store nahi kiya gaya.

Methods:

1. Static source inspection and manually traced state/approval paths.
2. Regex secret-pattern scan of fetched reachable Git blobs, with metadata-only results. No secret value is included.
3. `npm ci`, full/production npm audits, dependency update, `pip check`, `pip-audit`.
4. Regression tests covering real local mock MCP interactions plus isolated/stubbed provider error paths.
5. Next production build, lint, TypeScript checking, same-origin HTTP proxy smoke tests.

No exploitation of live deployments, no account access, no credential validation, no paid provider request, no real production remediation, no private repository inspection. Findings in public repos other than DevPulse are **secret-pattern review only**, not complete application audits or fixes.

## 3. Confirmed DevPulse findings and patches

Severity is contextual: a local-only demo has lower exposure than a public service with paid credentials or real infrastructure adapters. Package advisory presence does not prove a particular deployment was exploited.

| ID | Priority | Original problem / impact | Patch status / location |
|---|---|---|---|
| F01 | Critical package advisory | Next `16.2.9` and its dependency graph had reported advisories, including critical RCE conditions. The audit did not establish exploitability of this particular app. | **Updated** Next and `eslint-config-next` to `16.4.2`, lockfile refreshed. Production dependency audit now reports zero known findings. `frontend/package*.json`. |
| F02 | High | No request authentication on incident listing/control and analysis endpoints. Public exposure with server keys could spend provider quota or reveal source/incident data. | **Mitigated, not complete identity/RBAC**: optional bearer enforcement; production startup requires a token; private binding by default; frontend never auto-injects privileged tokens for public callers. `backend/main.py`, API proxy, launcher. Gateway integration remains required. |
| F03 | High | Approval accepted arbitrary `action_type`, `target`, and `value`; the mock SQL tool executed supplied SQL against a real local SQLite demo DB. | **Fixed for included mock boundary**: approval must match a server-proposed option; tool independently allowlists the exact SQL hotfix, rollback targets and scaling choices; unknown operations fail closed. `backend/main.py`, `backend/mcp/mock_splunk.py`. |
| F04 | High | Provider keys persisted in browser `localStorage`; an editable backend URL could send them to an arbitrary host. | **Fixed in frontend**: keys stay in React memory; old entries purged; same-origin, route-allowlisted server proxy replaces browser-selected backend destinations. `frontend/src/app/page.tsx`, API route. In-memory keys still need XSS prevention and HTTPS. |
| F05 | Medium | CORS allowed every origin with credentials; WebSocket had no auth/origin/existence policy. | **Restricted**: configured origins, no wildcard credential policy, WebSocket auth/origin checks, per-incident connection cap and send timeout. Browser incident UI now uses same-origin polling. `backend/main.py`, incident page. |
| F06 | Medium | No bounded input size, request rate or retained incident count; provider work had no total deadline. | **Mitigated for one process**: 250 KB body cap at API and proxy, 100k-character code cap, schema enums, 60 requests/minute per observed client, 100-incident cap, two concurrent live analyses, timeouts and sibling task cancellation. Distributed limits/queue still required. |
| F07 | Medium | Provider exceptions were returned to callers; Gemini validation put keys in URL; OpenRouter failures logged key suffixes. Default validation errors could echo submitted fields. | **Fixed in app-owned paths**: generic errors, exception-class-only diagnostics, header-based validation, no key suffix logging, redacted schema error responses, no-store headers. `backend/main.py`, `backend/devpulse.py`. |
| F08 | Medium | SPL validator was a permissive denylist; scope warning still permitted execution, macros/subsearches were not blocked, and tool boundary did not independently validate. | **Restricted**: explicit scoped first segment, read-only command subset, unsupported macros/subsearches/multi-statements blocked, tool validates too. `backend/mcp/security.py`, mock tool. Not a general-purpose SPL sandbox. |
| F09 | High correctness | Graph nodes return full message lists, but API appended them as deltas. Shared state also risked mutation aliasing. | **Fixed**: deep-copy input and replace snapshot fields instead of extending full histories. Regression verifies exactly one triage message and expected message count. `backend/main.py`. |
| F10 | High correctness | Approve/reject reran the graph from triage instead of continuing remediation; this could repeat work and lose expected flow semantics. | **Fixed**: resumed graph entry is remediation. Approvals are claimed before background execution; a second approval fails. `backend/agents/graph.py`, server. |
| F11 | Medium correctness | Remediation was marked executed even when MCP returned `success: false`. Audit report read action details from the wrong nested object. | **Fixed**: failed status/manual intervention is preserved; audit uses `selected_option`; invented token usage replaced by zero/unmeasured. Graph. |
| F12 | Medium availability | Shared MCP subprocess had unsynchronized request/response access, unvalidated IDs, blocking reads and undrained stderr pipe, and unbounded shutdown wait. | **Fixed for local protocol**: synchronized initialization/RPC, matching IDs, bounded message read with deadline even on a partial line, no unread stderr pipe, timed terminate/kill, lifespan cleanup. `backend/mcp/client.py`, graph, server. |
| F13 | Medium correctness | Query generation selected service keywords before Git/Kubernetes intent, so requested VCS/K8s evidence could be telemetry instead. Payment `stats` queries also returned K8s data. | **Fixed**: explicit query-type priority and payment telemetry routing; regression checks VCS/K8s requests. Mock tool. |
| F14 | Medium trust | “Performance boost” was invented as 45% when missing; raw word counts counted substrings such as LOW in ordinary words; frontend could display fixed +65% unrelated to result. | **Fixed/qualified**: no benchmark means zero/unmeasured; explicit severity-line heuristics replace substring counts; actual values and mode disclosures shown. Scores remain estimates, not certification. Backend analyzer and frontend. |
| F15 | Medium usability/trust | Missing credentials blocked code analysis; opening the app automatically demanded an API key. Demo responses were fixed samples. | **Fixed/qualified**: no automatic key prompt; absent server/client credentials use limited local static mode; canned samples explicitly identified. New `backend/local_analysis.py`. Live AI is not promised without a provider. |
| F16 | Medium deployment | Browser HTTP and WebSocket calls were hardcoded to localhost; remote users would reach their own machine and HTTPS pages could fail on mixed content. | **Fixed**: relative API URLs and server-only upstream; incident polling avoids insecure browser WebSocket URL. API route and pages. |
| F17 | Low/Medium reliability | Legacy hardcoded model choices and old HF endpoint; invalid key-pool format/aliases; language interpolated directly into code-fence regex. | **Updated** configurable model IDs and HF router endpoint, validated key pool and aliases, escaped regex language. No live model/provider availability validation was performed. |
| F18 | Medium operational | Launcher forcibly killed anything on ports 3000/8000, assumed `backend/venv`, and did not robustly clean child processes on exit. | **Fixed**: no unrelated process kills, root `.venv`, fail-fast setup, scoped child process cleanup, private default bindings. `run.sh`. Linux `setsid` dependency documented. |
| F19 | Low/Medium maintainability | No tests/CI, broad Python lower bounds, missing direct requests declaration, ESLint errors, unsafe `any`, unused code, remote font fetch build dependence. | **Fixed**: 34 tests, CI, pinned direct dependencies plus tested full environment lock, declared `requests`, typed UI state, lint cleanup, local/system font fallback. |
| F20 | Low/Medium secret hygiene | Only bare `.env` ignored; variant files could be committed. No reproducible redacted history scanner. | **Improved** ignores for secret variants and key files, committed safe example env files, metadata-only scanner, CI scan. Ignores never remove historical secrets or replace rotation. |

## 4. Secret findings: all 23 public repos

Full per-repo inventory and evidence are in [PUBLIC_REPO_SCAN.md](PUBLIC_REPO_SCAN.md) and `reports/public-repo-secret-scan.json`.

| Repo needing review | Raw candidates | Interpretation | Recommended action |
|---|---:|---|---|
| `jeeplan2027` | 5 historical blob occurrences | Google-format API key in Firebase client config/service-worker config. Firebase client keys are normally public identifiers, not private authorization secrets by themselves. | Review Google API restrictions, quotas and Firestore/Storage security rules. Those controls were **not tested**. Do not label it a confirmed private-key leak solely from this match. |
| `omnidetect-ai` | 2 historical blob occurrences | Mock/test key-shaped strings in backend tests. Current test files use environment configuration or an explicitly non-usable fixture. | Keep fixtures visibly fake and never log live keys; historical matches alone do not show a valid credential. |
| `pi-control-center` | 5 historical blob occurrences | Private-key BEGIN text inside HTML textarea placeholders, not complete PEM credentials. | Not a demonstrated private-key leak; tune scanner exceptions narrowly if desired. |
| `SUDO-SPANDR` | 3 occurrences in a binary blob | Credential-like strings/PEM markers inside checked-in `cloudflared` executable. Matches are low confidence and not demonstrated usable credentials. | Prefer verified upstream binary delivery with checksum/signature and review binary provenance. A string-marker match is not a cryptographic credential validation. |

The other **19 public repos**, including DevPulse, had zero candidates under configured patterns. That is not a clean bill of health. Counts include repeat values across historical file versions, not necessarily unique secrets. **No other public repository was modified.**

## 5. Reproducible verification results

| Check | Recorded result | Evidence |
|---|---|---|
| Backend/security regression | **34 passed** | `reports/pytest.txt`, `tests/test_security.py` |
| Frontend ESLint | **0 errors, 0 warnings** | `reports/lint.txt`; final strict lint rerun passed |
| TypeScript | `tsc --noEmit` and build typecheck passed | production build output |
| Production frontend build | **Passed**, Next 16.4.2 | `reports/build.txt` |
| npm full audit before | 15 findings | `reports/npm-audit-before.json` |
| npm full audit after | **5 high dev-only entries**, one braces chain | `reports/npm-audit-after.json` |
| npm production audit | **0 known findings** | `reports/npm-audit-production.json` |
| Python dependency consistency | `pip check`: no broken requirements | tested environment lock |
| Python dependency audit | **0 known findings** in resolved environment | `reports/pip-audit.json` |
| HTTP smoke | Dashboard 200, health proxy 200, no-key local analysis, cross-origin 403, oversized body 413, unknown proxy route 404 | `reports/proxy-smoke.txt` |
| Original DevPulse secret scan | 18 commits / 73 blobs / 0 pattern candidates | `reports/devpulse-original-secret-scan.json` |
| Broader public secret scan | 23 repos / 426 commits / 3,016 blobs / 15 raw candidates | public scan evidence |

Regression tests include arbitrary-SQL rejection, valid/invalid SPL, approval/rejection resume without repeated triage, snapshot message handling, failed remediation semantics, auth, production startup policy, body/rate caps, schema redaction, CORS, MCP parallel requests and partial-line timeout, provider error sanitization/cancellation, unmeasured metrics and offline checks. Tests did not call paid providers.

## 6. Remaining npm advisory — openly tracked

Five current high entries are all the dependency chain:

`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`

Underlying advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), stack-exhaustion denial of service through deeply nested patterns. Current audit metadata lists `braces <=3.0.3` and does not list a patched release. Blindly following `npm audit fix --force` would suggest a framework-generation downgrade rather than a safe tested upgrade. **This finding is not fixed.** It is in lint/build tooling, not the production-only dependency graph. CI should stay isolated/resource-limited and upstream should be monitored. Production-only audit is gated in the supplied workflow; the unresolved full audit is documented.

## 7. Jo abhi bhi baaki hai

1. **Production identity/RBAC/tenant isolation:** bearer token + local defaults are only a boundary. A real authenticated gateway and per-user/incident authorization are still needed. The browser UI does not implement login or privileged-token entry. Without gateway auth forwarding, a token-protected backend returns 401 by design.
2. **Durability/concurrency across workers:** incident state, audit arrays, background jobs and rate limits are in memory. Restarts lose state; multiple workers do not share it. Add database, job queue, distributed quotas and recovery semantics before real operations.
3. **Real integrations:** telemetry, Slack/ChatOps, Kubernetes scaling and much incident reasoning are simulations. Local SQLite/mock file changes are real only within the demo. No real Splunk/Kubernetes/Slack adapters were verified or added.
4. **AI validity and prompt injection:** code/comments are untrusted input. Prompt hardening is not a sandbox. Model fixes must be reviewed; never auto-execute generated code. Health score is heuristic and speedup is not measured.
5. **Offline analysis coverage:** it checks only a few patterns, not all OWASP classes. Python checks are not a full data-flow analysis; non-Python coverage is very limited. Safe code may be flagged and unsafe code may be missed. No automatic secure refactoring is claimed offline.
6. **Secrets coverage:** no private repos, unfetched PR refs, unreachable/deleted objects, LFS payloads, external caches/releases, screenshot OCR, encoded secrets or exhaustive entropy scan. Firebase rules/restrictions and candidate validity were not tested. Add an established scanner plus GitHub push protection.
7. **Live provider compatibility and costs:** the supplied exposed key was not used. Endpoint/model changes are configurable, but live provider permissions, availability, billing and end-to-end LLM output remain unverified.
8. **UI coverage:** lint, typecheck, build and HTTP smoke passed; no exhaustive browser accessibility/visual/device test suite was run. Historical pitch content is not verified functionality.
9. **Outstanding tooling advisory:** five dev-only audit entries remain as explained above. Audit databases and package availability can change after this report.

## 8. Apply patched code

Safest: unzip the supplied patched source into a **new folder**, inspect it, run the README verification commands, then selectively merge into your own repository. No real credential is included.

If applying the supplied diff to an existing clone, first switch to the audited original commit in a clean working tree or create a fresh worktree. From that repository root:

```bash
git apply --check /path/to/devpulse-fixes.patch
git apply /path/to/devpulse-fixes.patch
```

Patch application to a different/upstream-updated revision may need manual merge. The archive and diff include the patched source, documentation and redacted evidence. After review, **you** can commit and push through your own authenticated Git workflow. The initial audit was local-only; the follow-up delivery publishes the reviewed fixes to `security/audit-fixes-20261016`, without directly changing the default branch.

## 9. Immediate checklist

- [ ] Revoke chat-exposed key; inspect provider usage/billing; store any new key only in trusted environment/secret manager.
- [ ] Run patched app in no-key/offline mode first.
- [ ] Review Firebase restrictions/rules in `jeeplan2027` separately.
- [ ] Enable GitHub secret scanning and push protection where supported.
- [ ] Review/merge the fixes; do not expose paid server credentials on a public unauthenticated endpoint.
- [ ] Plan production auth, persistence, job queue and real integration work; track the dev-only dependency advisory.
