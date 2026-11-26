#!/usr/bin/env bash
# Kill switch of risk-execution, from the operator's machine (runbook-risk-execution.md).
# Usage: bash scripts/risk-admin.sh status
#        bash scripts/risk-admin.sh engage|rearm --reason "<text>" [--symbol BTCUSDT]
#        bash scripts/risk-admin.sh reduce --symbol BTCUSDT --quantity 0.5   (sell, allowed under the switch: policy §4.1)
# Scope is global without --symbol, symbol with it. `status` accepts only the service's own SVID, so it runs
# from the pod (kubectl exec). `engage`/`rearm`/`reduce` go through the gateway (scope risk:admin, ADR-0059): the
# API key name is the actor. Env: RISK_ADMIN_URL (edge-proxy base URL), RISK_ADMIN_KEY (API key),
# NAMESPACE, DRY_RUN=true (prints the request, calls nothing). Needs jq; kubectl for status.

set -euo pipefail

NAMESPACE=${NAMESPACE:-trading-model}
DRY_RUN=${DRY_RUN:-false}

die() { echo "[risk-admin] ERROR: $*" >&2; exit 1; }
usage() { die "usage: risk-admin.sh status | engage|rearm --reason <text> [--symbol <SYMBOL>] | reduce --symbol <SYMBOL> --quantity <N>"; }

cmd=${1:-}
[ $# -gt 0 ] && shift
reason="" symbol="" quantity=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reason) [ $# -ge 2 ] || usage; reason=$2; shift 2 ;;
    --symbol) [ $# -ge 2 ] || usage; symbol=$2; shift 2 ;;
    --quantity) [ $# -ge 2 ] || usage; quantity=$2; shift 2 ;;
    *) usage ;;
  esac
done

case "$cmd" in
  status) method=GET; path=/admin/status ;;
  engage) method=POST; path=/v1/risk-execution/admin/kill-switch ;;
  rearm) method=POST; path=/v1/risk-execution/admin/kill-switch/rearm ;;
  reduce) method=POST; path=/v1/risk-execution/admin/reduce ;;
  *) usage ;;
esac
if [ "$cmd" = reduce ]; then
  [ -n "$symbol" ] && [[ $quantity =~ ^[0-9]*\.?[0-9]+$ ]] || usage
elif [ "$cmd" != status ] && [ -z "$reason" ]; then usage; fi

body=""
if [ "$cmd" = reduce ]; then
  body=$(jq -n --arg s "$symbol" --argjson q "$quantity" '{symbol:$s,quantity:$q}')
elif [ "$method" = POST ]; then
  body=$(jq -n --arg r "$reason" --arg s "$symbol" \
    'if $s == "" then {scope:"global"} else {scope:"symbol",symbol:$s} end + {reason:$r}')
fi

if [ "$DRY_RUN" = true ]; then
  echo "$method $path"
  [ -z "$body" ] || echo "$body"
  exit 0
fi

if [ "$method" = POST ]; then
  : "${RISK_ADMIN_URL:?set RISK_ADMIN_URL}" "${RISK_ADMIN_KEY:?set RISK_ADMIN_KEY}"
  printf '%s' "$body" | curl -s -H @<(printf 'x-api-key: %s' "$RISK_ADMIN_KEY") -H content-type:application/json --data-binary @- "$RISK_ADMIN_URL$path"
  echo
  exit 0
fi

pod=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/component=risk-execution -o jsonpath='{.items[0].metadata.name}')
[ -n "$pod" ] || die "no risk-execution pod in $NAMESPACE"
# node -e: the image has no curl.
kubectl exec -n "$NAMESPACE" "$pod" -c risk-execution -- node -e 'const f=require("fs"),d="/run/spire/svid/";require("https").get(process.argv[1],{cert:f.readFileSync(d+"svid.pem"),key:f.readFileSync(d+"svid_key.pem"),rejectUnauthorized:false},r=>r.pipe(process.stdout)).on("error",()=>process.exit(1))' "https://localhost:3000$path"
echo
