#!/usr/bin/env bash
# Grafana OIDC gate of deploy.yml (ADR-0063). Usage: check-grafana-oidc.sh <env> < rendered-overlay
# Production: every key below must exist in trading-model-secrets. The values are
# sealed, so only presence is checkable here; "true" and a closed IdP are the owner's duty.
set -euo pipefail
env="$1"
rendered=$(cat)
missing=""
for key in GRAFANA_OIDC_ENABLED GRAFANA_OIDC_CLIENT_ID GRAFANA_OIDC_CLIENT_SECRET GRAFANA_OIDC_AUTH_URL GRAFANA_OIDC_TOKEN_URL GRAFANA_OIDC_API_URL GRAFANA_OIDC_ALLOWED_DOMAINS GRAFANA_ROOT_URL; do
  grep -qE "^ +$key: " <<<"$rendered" || missing="$missing $key"
done
[ -z "$missing" ] && exit 0
if [ "$env" = production ]; then
  echo "::error::trading-model-secrets of production lacks:$missing: Grafana would keep only the shared admin account or a broken OIDC login (ADR-0063)"
  exit 1
fi
echo "::warning::trading-model-secrets of $env lacks:$missing: Grafana OIDC is not fully configured (ADR-0063)"
