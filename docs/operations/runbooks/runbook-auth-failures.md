# Runbook: Authentication Failures and ACL Denials

**Severity:** SEV3 (warning)
**Alerts:** `ApiAuthFailuresHigh`, `MtlsAclDenials`

## ApiAuthFailuresHigh

Fires when `sum by (job) (rate(gw_auth_failures_total[5m]))` stays above
0.1/s (6 per minute) for 5 minutes. Threshold: a legitimate client with a
good key produces none; a client retrying every second or two is above it, a
human typo is not. Tune it here and in `observability/alerting.yml` if a
known client is noisy.

1. Find the source: `kubectl logs deploy/api-gateway -n trading-model | grep -i auth`
   (client address, `x-forwarded-for` from `edge-proxy`).
2. Known client with a stale key: give it the current key (`GATEWAY_AUTH_TOKENS`).
3. Unknown source: block it at the edge (`edge-proxy` / network policy) and
   rotate `GATEWAY_AUTH_TOKENS` if a key may have leaked.

## MtlsAclDenials

Fires on any increase of `http_mtls_denials_total` (label `reason`:
`non_tls`, `unauthorized_handshake`, `no_client_certificate`,
`identity_unresolved`, `unauthenticated`, `caller_unresolved`,
`caller_not_allowed`, `no_policy`). The `job` label is the service that
refused. Service-to-service traffic is never denied in normal operation.

1. Read the denial: `kubectl logs deploy/<job> -n trading-model | grep -i forbidden`
   (names the caller and target).
2. `caller_not_allowed` / `no_policy` after a deploy: the ACL
   (`packages/http/src/adapters/inbound/acl-config.ts`) lacks the new caller
   or route; fix it in code.
3. Certificate reasons: check SVID rotation (`runbook-certificate-expiry`).
4. Caller unknown and not expected: a probe from inside the cluster; treat as
   a security incident.
