# ADR-0063: Grafana Per-Person Access Through OIDC

**Status:** Accepted
**Date:** 2026-11
**Related:** [ADR-0056](./0056-infrastructure-metrics-exporters.md) (observability stack)
**Verified by:** `tests/k8s/check-overlays.mjs` (Viewer default role, sign-up closed, anonymous off, every OIDC key an optional Secret key), `tests/k8s/check-grafana-oidc.test.sh` (CI), `bun run config:check`

## Context

Grafana had one shared `admin` account. Reads of Loki logs (truncated IPs) were attributable to nobody and every reader was an administrator (audit conformité 2026-11-09, m3, issue #740).

## Decision

1. **Generic OIDC** (`GF_AUTH_GENERIC_OAUTH_*`), identity provider outside the repository. Settings are optional keys of `trading-model-secrets` in K8s (`GRAFANA_OIDC_ENABLED`, `_CLIENT_ID`, `_CLIENT_SECRET`, `_AUTH_URL`, `_TOKEN_URL`, `_API_URL`, `_ALLOWED_DOMAINS`, plus `GRAFANA_ROOT_URL` for `GF_SERVER_ROOT_URL`, the base of the OIDC `redirect_uri`) and same-named variables in compose. No client credential is committed.
2. **Always on, all environments:** anonymous access off, local sign-up closed, default role `Viewer`; the first OIDC login creates a Viewer. Admin is granted by hand.
3. **Without IdP:** OIDC stays off (dev, CI kind render). `scripts/check-grafana-oidc.sh` (called by `deploy.yml`) fails production when the Secret lacks any of these 8 keys; other environments get a warning.
4. **Break-glass:** the local `admin` account (`GRAFANA_PASSWORD`) stays, used only when the IdP is down. Each use is logged in the incident log and followed by a password rotation (`access-control-policy.md` 5.3). With OIDC on, `GF_AUTH_DISABLE_LOGIN_FORM` follows the same Secret key (`GRAFANA_OIDC_ENABLED`) and `GF_AUTH_BASIC_ENABLED` reads `GRAFANA_BASIC_AUTH_ENABLED` (set `false`): on the pinned image the flag alone refuses `POST /login` but still accepts basic auth on the API, so both are off and the public Ingress offers no password path. Without OIDC both stay on. A port-forward does not bring them back: procedure in [runbook-grafana-break-glass](../operations/runbooks/runbook-grafana-break-glass.md) (Ingress restricted to the operator IP, keys set to `false`, restart).
5. **Access restriction:** `GRAFANA_OIDC_ALLOWED_DOMAINS` is required in production, and the IdP must be a closed directory (company tenant, not a public GitHub/Google). Auto sign-up on first login is safe only under that condition.
6. **Traceability:** Grafana OSS logs logins (logger `context`, `GF_LOG_FILTERS`) to stdout, collected by promtail into Loki; this replaces the Enterprise audit log. Grafana docs name `context` the HTTP request logger, which logs authentication events; not confirmed on a live instance: check after the first deploy.

## Alternatives Considered

| Alternative | Reason for Rejection |
| --- | --- |
| Named local accounts by provisioning | No SSO, passwords to manage |
| oauth2-proxy in front | One more component |

## Consequences

Grafana has no egress NetworkPolicy, so the IdP is reachable; add an HTTPS egress rule if one is introduced. Secret values are sealed: the gate checks key presence, not that `ENABLED` is `true`. The OIDC flow is not run in CI (no Internet egress): only the rendered settings are checked.
