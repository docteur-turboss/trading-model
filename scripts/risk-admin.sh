#!/usr/bin/env bash
# Kill switch of risk-execution, from the operator's machine (runbook-risk-execution.md).
# Usage: bash scripts/risk-admin.sh status
#        bash scripts/risk-admin.sh engage|rearm --reason "<text>" [--symbol BTCUSDT]
# Scope is global without --symbol, symbol with it. The admin routes accept only the service's own SVID,
# so the call runs from the pod (`kubectl exec` right = authentication); the JSON goes through stdin.
# Actor = `kubectl auth whoami` (kubectl >= 1.28). ACTOR=<name> forces it (e.g. RISK_OWNER_ACTOR for a
# `drawdown` re-arm, when it differs from the Kubernetes name).
# Env: ACTOR, NAMESPACE, DRY_RUN=true (prints the request, calls nothing). Needs kubectl and jq.

set -euo pipefail

NAMESPACE=${NAMESPACE:-trading-model}
DRY_RUN=${DRY_RUN:-false}

die() { echo "[risk-admin] ERROR: $*" >&2; exit 1; }
usage() { die "usage: risk-admin.sh status | engage|rearm --reason <text> [--symbol <SYMBOL>]"; }

cmd=${1:-}
[ $# -gt 0 ] && shift
reason="" symbol=""
while [ $# -gt 0 ]; do
  case "$1" in
    --reason) [ $# -ge 2 ] || usage; reason=$2; shift 2 ;;
    --symbol) [ $# -ge 2 ] || usage; symbol=$2; shift 2 ;;
    *) usage ;;
  esac
done

case "$cmd" in
  status) method=GET; path=/admin/status ;;
  engage) method=POST; path=/admin/kill-switch ;;
  rearm) method=POST; path=/admin/kill-switch/rearm ;;
  *) usage ;;
esac
if [ "$cmd" != status ] && [ -z "$reason" ]; then usage; fi

body=""
if [ "$method" = POST ]; then
  actor=${ACTOR:-$(kubectl auth whoami -o jsonpath='{.status.userInfo.username}' 2>/dev/null)} ||
    die "kubectl auth whoami failed (kubectl < 1.28?): set ACTOR=<name>"
  [ -n "$actor" ] || die "empty actor: set ACTOR=<name>"
  body=$(jq -n --arg r "$reason" --arg a "$actor" --arg s "$symbol" \
    'if $s == "" then {scope:"global"} else {scope:"symbol",symbol:$s} end + {reason:$r,actor:$a}')
fi

if [ "$DRY_RUN" = true ]; then
  echo "$method $path"
  [ -z "$body" ] || echo "$body"
  exit 0
fi

pod=$(kubectl get pods -n "$NAMESPACE" -l app.kubernetes.io/component=risk-execution -o jsonpath='{.items[0].metadata.name}')
[ -n "$pod" ] || die "no risk-execution pod in $NAMESPACE"
# node -e: the image has no curl; stdin carries the POST body.
req=(node -e 'const f=require("fs"),d="/run/spire/svid/",[m,u]=process.argv.slice(1);const q=require("https").request(u,{method:m,headers:{"content-type":"application/json"},cert:f.readFileSync(d+"svid.pem"),key:f.readFileSync(d+"svid_key.pem"),rejectUnauthorized:false},r=>r.pipe(process.stdout));q.on("error",()=>process.exit(1));process.stdin.pipe(q)')
if [ "$method" = POST ]; then
  printf '%s' "$body" | kubectl exec -i -n "$NAMESPACE" "$pod" -c risk-execution -- "${req[@]}" POST "https://localhost:3000$path"
else
  kubectl exec -n "$NAMESPACE" "$pod" -c risk-execution -- "${req[@]}" GET "https://localhost:3000$path" </dev/null
fi
echo
