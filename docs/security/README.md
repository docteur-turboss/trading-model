# Security

Security documentation for the trading-model platform.

| Document | Content |
| -------- | ------- |
| [Security Practices](practices.md) | mTLS, HMAC tokens, env validation, secrets management |
| [Security Policy](../../SECURITY.md) | Vulnerability reporting and disclosure |
| [Access Control Policy](../compliance/access-control-policy.md) | Zero-trust service access model |
| [ADR-0005](../adr/0005-mtls-security.md) | Mutual TLS for all inter-service communication |

## Application security tests

| Test | What it proves |
| ---- | -------------- |
| `services/audit-logger/tests/unit/routes/events-injection.spec.ts` | `GET /events`, `/events/:messageId`, `/events/stats`: a MongoDB operator (`p[$ne]`, `[$gt]`, `[$where]`, `[$regex]`, JSON `{"$ne":null}`) is refused or reaches the repository as a string; seeded fuzz never gives a 500 |
| `services/dlq-service/tests/unit/dlq-query-injection.spec.ts` | Same for `GET /dlq` |
| E2E step "ZAP baseline" (`ci.yml`) | Passive `zap-baseline.py` scan of the edge-proxy with the E2E API key; report `zap-baseline-report` (artifact). Non-blocking (`-I`) at first; rules ignored for lack of a frontend (ADR-0018) are commented in `tests/security/zap-baseline.conf`. No active scan. |
