# Security

Security documentation for the trading-model platform.

| Document | Content |
| -------- | ------- |
| [Security Practices](practices.md) | mTLS, HMAC tokens, env validation, secrets management |
| [Security Policy](../../SECURITY.md) | Vulnerability reporting and disclosure |
| [Access Control Policy](../compliance/access-control-policy.md) | Zero-trust service access model |
| [ADR-0011](../adr/0011-spiffe-spire-workload-identity.md) | mTLS between services through SPIFFE/SPIRE workload identity |

## Application security tests

| Test | What it proves |
| ---- | -------------- |
| `services/audit-logger/tests/unit/routes/events-injection.spec.ts` | `GET /events`, `/events/:messageId`, `/events/stats`: a MongoDB operator (`p[$ne]`, `[$gt]`, `[$where]`, `[$regex]`, JSON `{"$ne":null}`) is refused or reaches the repository as a string; seeded fuzz never gives a 500 |
| E2E step "ZAP baseline" (`ci.yml`) | Passive `zap-baseline.py` scan of the edge-proxy with the E2E API key; report `zap-baseline-report` (artifact). Blocking: an alert not triaged in `zap-baseline.conf` fails the job; rules ignored for lack of a frontend (ADR-0018) are commented in `tests/security/zap-baseline.conf`. No active scan. |
