#!/usr/bin/env bash
# DRY_RUN of scripts/risk-admin.sh: JSON escaping, scope, usage errors. Needs jq.
set -euo pipefail
S="$(dirname "$0")/../../scripts/risk-admin.sh"
export DRY_RUN=true

reason="it's \"bad\" \$HOME"
out=$(bash "$S" engage --reason "$reason")
[ "$(sed -n 1p <<<"$out")" = "POST /v1/risk-execution/admin/kill-switch" ] || { echo "FAIL route"; exit 1; }
[ "$(sed -n '2,$p' <<<"$out" | jq -r .reason)" = "$reason" ] || { echo "FAIL escaping"; exit 1; }
[ "$(bash "$S" rearm --reason r | sed 1d | jq -r .scope)" = global ] || { echo "FAIL global"; exit 1; }
[ "$(bash "$S" rearm --reason r --symbol BTCUSDT | sed 1d | jq -r .symbol)" = BTCUSDT ] || { echo "FAIL symbol"; exit 1; }
for bad in "engage" "engage --reason" "bogus" ""; do
  # shellcheck disable=SC2086
  if bash "$S" $bad >/dev/null 2>&1; then echo "FAIL usage: $bad"; exit 1; fi
done
echo "risk-admin tests passed"
