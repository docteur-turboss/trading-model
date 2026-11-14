#!/usr/bin/env bash
# scripts/check-grafana-oidc.sh on fake rendered overlays.  bash tests/k8s/check-grafana-oidc.test.sh
set -euo pipefail
S="$(cd "$(dirname "$0")/../.." && pwd)/scripts/check-grafana-oidc.sh"
KEYS="GRAFANA_OIDC_ENABLED GRAFANA_OIDC_CLIENT_ID GRAFANA_OIDC_CLIENT_SECRET GRAFANA_OIDC_AUTH_URL GRAFANA_OIDC_TOKEN_URL GRAFANA_OIDC_API_URL GRAFANA_OIDC_ALLOWED_DOMAINS GRAFANA_ROOT_URL GRAFANA_BASIC_AUTH_ENABLED"
render() { for k in "$@"; do echo "    $k: AgX"; done; }
fail=0
expect() { # name expected-exit env keys...
  local name=$1 want=$2 env=$3; shift 3
  local got=0; render "$@" | bash "$S" "$env" >/dev/null || got=$?
  if [ "$got" = "$want" ]; then echo "  ✓ $name"; else echo "  ✗ $name (exit $got, want $want)"; fail=1; fi
}
expect "production, all keys" 0 production $KEYS
expect "production, no key" 1 production
for k in $KEYS; do expect "production lacks $k" 1 production $(printf '%s\n' $KEYS | grep -vx "$k"); done
expect "staging, no key warns only" 0 staging
exit $fail
