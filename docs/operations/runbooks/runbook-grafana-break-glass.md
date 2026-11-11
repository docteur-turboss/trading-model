# Runbook: Grafana break-glass (identity provider down)

**When:** OIDC is on (`GRAFANA_OIDC_ENABLED=true`) and nobody can log in. With OIDC on, the local login form and basic auth are off (`GF_AUTH_DISABLE_LOGIN_FORM`, `GF_AUTH_BASIC_ENABLED=false`; checked on the pinned image: `POST /login` returns 400, `Authorization: Basic` returns 401). A port-forward does not bring them back. ADR-0063, `access-control-policy.md` 5.3.

**Production setting:** with OIDC on, the Secret `trading-model-secrets` must carry `GRAFANA_OIDC_ENABLED=true` and `GRAFANA_BASIC_AUTH_ENABLED=false`.

## Steps

1. Write the incident log entry (who, why, when).
2. Close the Ingress to your IP only (the public form must never reopen):
   `kubectl -n <ns> annotate ingress grafana nginx.ingress.kubernetes.io/whitelist-source-range=<your-ip>/32 --overwrite`
3. Set both Secret keys to `false` (re-seal and apply `trading-model-secrets`, or `kubectl patch` it). Basic auth stays off during break-glass: log in through the form (step 5), not `curl -u`.
4. Restart: `kubectl -n <ns> rollout restart statefulset/grafana`.
5. Log in as `admin` (`GRAFANA_PASSWORD`): `kubectl -n <ns> port-forward svc/grafana 3000:3000`, then `http://localhost:3000/login`.
6. Password lost: `kubectl -n <ns> exec statefulset/grafana -- grafana cli admin reset-admin-password '<new>'`.

## Afterwards

1. Set `GRAFANA_OIDC_ENABLED=true` and `GRAFANA_BASIC_AUTH_ENABLED=false` again, restart Grafana.
2. Remove the annotation: `kubectl -n <ns> annotate ingress grafana nginx.ingress.kubernetes.io/whitelist-source-range-`
   (if the overlay sets it, re-apply the overlay instead).
3. Rotate `GRAFANA_PASSWORD`.

In production, `GRAFANA_BASIC_AUTH_ENABLED` absent from the Secret is an error: `scripts/check-grafana-oidc.sh` fails the deploy.
