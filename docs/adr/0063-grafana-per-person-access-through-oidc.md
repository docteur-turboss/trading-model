# ADR-0063: Grafana Per-Person Access Through OIDC

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0056](./0056-infrastructure-metrics-exporters.md) (observability stack)
**Verified by:** `tests/k8s/check-overlays.mjs` (every overlay renders Grafana with Viewer default role, sign-up closed, anonymous off, OIDC client secret from an optional key), `bun run config:check`

## Context

Grafana had one shared `admin` account. Reads of Loki logs (truncated IPs) were attributable to nobody and every reader was an administrator (audit conformité 2026-11-09, m3, issue #740).

## Decision

1. **Generic OIDC** (`GF_AUTH_GENERIC_OAUTH_*`), identity provider outside the repository. Settings are optional keys of `trading-model-secrets` in K8s (`GRAFANA_OIDC_ENABLED`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTH_URL`, `_TOKEN_URL`, `_API_URL`) and same-named variables in compose. No client credential is committed.
2. **Always on, all environments:** anonymous access off, local sign-up closed, default role `Viewer`; the first OIDC login creates a Viewer. Admin is granted by hand.
3. **Without IdP:** OIDC stays off (dev, CI kind render). `deploy.yml` fails production when the Secret lacks `GRAFANA_OIDC_ENABLED`; other environments get a warning.
4. **Break-glass:** the local `admin` account (`GRAFANA_PASSWORD`) stays, used only when the IdP is down. Each use is logged in the incident log and followed by a password rotation (`access-control-policy.md` 5.3).
5. **Traceability:** Grafana OSS logs logins (logger `context`, `GF_LOG_FILTERS`) to stdout, collected by promtail into Loki; this replaces the Enterprise audit log.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Named local accounts by provisioning | No SSO, passwords to manage |
| oauth2-proxy in front | One more component |

## Consequences

Grafana has no egress NetworkPolicy, so the IdP is reachable; add an HTTPS egress rule if one is introduced. The OIDC flow is not run in CI (no Internet egress): only the rendered settings are checked.
