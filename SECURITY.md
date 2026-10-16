# Security status and deployment requirements

## Credentials

A key pasted into a chat, public issue, commit, screenshot or log must be treated as exposed. Revoke it at the provider, inspect usage/billing, and create a replacement only in trusted secret storage. Deleting a commit or ignoring `.env` does not revoke credentials or erase clones/caches. No real key is included in this patch, and no submitted credential was tested.

Browser keys are memory-only. Older `localStorage` key entries are removed on mount. The frontend cannot choose an arbitrary backend host. Gemini validation uses an authentication header instead of a query-string key. Provider errors and credential suffixes are not logged or returned. Validation errors do not echo input fields.

## Remaining dependency advisory

Full npm audit on the recorded environment reports five high entries in a **single dev-tool dependency chain**:

`eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces`

Underlying advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), stack-exhaustion DoS in `braces <= 3.0.3`. The audit metadata lists no patched range at audit time. Five audit entries do not mean five independent runtime vulnerabilities. Do not apply npm's suggested framework-generation downgrade blindly. Keep lint/build jobs isolated from untrusted glob patterns and resource-limit CI; track upstream. Production-only npm audit reports zero known advisories. This does not prove the application is vulnerability-free.

CI gates production npm dependencies and resolved Python dependencies. The remaining full npm audit is documented, not silently declared fixed.

## Before any public/paid deployment

1. Set `DEVPULSE_ENV=production` and a strong `DEVPULSE_API_TOKEN`; fail-closed startup is implemented.
2. Put a real identity-aware gateway in front of the UI/API and forward authorized bearer credentials server-side. The frontend does not have a login UI and does not automatically give public callers privileged backend credentials.
3. Keep the backend private; use HTTPS at the public edge; set explicit origin/trusted-host policy at the gateway. Do not trust caller-supplied forwarding headers.
4. Add tenant-aware authorization to every incident and remediation action. A shared static bearer token is not multi-user RBAC.
5. Replace single-process incident dictionaries, local audit arrays, and background tasks with durable storage and a job queue. Add distributed request, connection, payload and spending quotas.
6. Review retention, provider privacy and source-code sharing. Local static mode never needs to send code to an AI provider.
7. Keep all remediation restricted to the included mock environment until a separately reviewed, least-privilege production adapter exists. SPL validation is a deliberately restricted allowlist, not a complete parser or security sandbox.
8. Enable GitHub secret scanning and push protection; scan new commits, branches, PR refs, release assets, logs, images and LFS content. The included pattern scanner cannot cover every credential type or encoded/unknown secret.
9. Model output is untrusted. Prompt instructions reduce accidental prompt injection but are not an isolation boundary; never automatically execute returned code.

## Reporting

Use GitHub's private vulnerability reporting feature if enabled, or contact the repository owner privately. Do not include raw credentials in public reports. The follow-up delivery branch is `security/audit-fixes-20261016`; a separate branch is not a production deployment or a merge into the default branch.
