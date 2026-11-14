#!/usr/bin/env bash
# `deploy-k8s.sh verify-release` (issue #425), off any cluster: a stub `kubectl`
# answers the Secret, the edge-proxy call and Prometheus. Checks the pass, each
# failing check, the key never on a command line, and the repeated window. Needs jq.
#   bash tests/k8s/verify-release.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY="$ROOT/deploy/k8s/scripts/deploy-k8s.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
pass() { echo "  ✓ $*"; }
failed() { echo "  ✗ $*"; FAILED=1; }

mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
DEFAULT_FRESH='{"data":{"result":[{"value":[0,"42"]}]}}'
DEFAULT_ALERTS='{"data":{"result":[]}}'
echo "$*" >>"$STUB_DIR/kubectl.log"
case "$*" in
*cluster-info* | "auth can-i"*) ;;
*"get secret"*) printf 'secret-key,other' | base64 ;;
*"exec -i"*discovery-server*) cat >"$STUB_DIR/stdin"; printf '%s' "${STUB_CODE:-200}" ;;
*prometheus-0*"fs_candles_persisted_total"*) echo "${STUB_FRESH:-$DEFAULT_FRESH}" ;;
*prometheus-0*ALERTS*) echo "${STUB_ALERTS:-$DEFAULT_ALERTS}" ;;
*) echo "unexpected kubectl call: $*" >&2; exit 9 ;;
esac
STUB
printf '#!/usr/bin/env bash\necho "$*" >>"$STUB_DIR/sleep.log"\n' >"$WORK/bin/sleep"
chmod +x "$WORK/bin/"*
export PATH="$WORK/bin:$PATH" STUB_DIR="$WORK" VERIFY_WINDOW_SECONDS=0
run() { : >"$WORK/kubectl.log"; : >"$WORK/sleep.log"; bash "$DEPLOY" verify-release >"$WORK/out" 2>&1; }

echo "healthy release"
if run; then pass "passes"; else failed "should pass"; cat "$WORK/out"; fi
grep -q "x-api-key: secret-key" "$WORK/stdin" && pass "first gateway key sent on stdin" || failed "key not sent"
grep -q "secret-key" "$WORK/kubectl.log" && failed "key on a command line" || pass "key not on a command line"

echo "API call fails"
if STUB_CODE=401 run; then failed "401 should fail"; else pass "fails"; fi
grep -q "answered 401" "$WORK/out" && pass "names the status" || failed "no status in message"

echo "no fresh data"
if STUB_FRESH='{"data":{"result":[]}}' run; then failed "no data should fail"; else pass "fails"; fi

echo "staging: VERIFY_REQUIRE_FRESH_DATA=false"
if STUB_FRESH='{"data":{"result":[]}}' VERIFY_REQUIRE_FRESH_DATA=false run; then pass "no data passes"; else failed "no data should pass"; cat "$WORK/out"; fi
grep -q "fs_candles_persisted_total" "$WORK/kubectl.log" && failed "data still queried" || pass "data not queried"
grep -q "MarketDataStale" "$WORK/kubectl.log" && pass "MarketDataStale excluded from the alert query" || failed "MarketDataStale not excluded"

echo "critical alert firing"
if STUB_ALERTS='{"data":{"result":[{"metric":{"alertname":"MarketDataStale"}}]}}' run; then failed "critical alert should fail"; else pass "fails"; fi
grep -q "MarketDataStale" "$WORK/out" && pass "names the alert" || failed "alert not named"

echo "critical alert already firing before the deploy"
TWO='{"data":{"result":[{"metric":{"alertname":"BackupIncrementalStale","job":"backup-metrics","instance":"x:9118"}},{"metric":{"alertname":"RedisDown"}}]}}'
printf 'BackupIncrementalStale{job=backup-metrics, instance=x:9118}
' >"$WORK/baseline"
if STUB_ALERTS='{"data":{"result":[{"metric":{"alertname":"BackupIncrementalStale","job":"backup-metrics","instance":"x:9118"}}]}}' VERIFY_BASELINE_FILE="$WORK/baseline" run; then pass "baseline alert alone passes"; else failed "baseline alert should pass"; cat "$WORK/out"; fi
grep -q "firing before the deploy, not blocking: BackupIncrementalStale" "$WORK/out" && pass "reports the baseline alert" || failed "baseline alert not reported"
if STUB_ALERTS="$TWO" VERIFY_BASELINE_FILE="$WORK/baseline" run; then failed "new alert should fail"; else pass "new alert fails"; fi
grep -q "critical alert(s) firing: RedisDown$" "$WORK/out" && pass "names only the new alert" || { failed "new alert not named alone"; cat "$WORK/out"; }
STUB_ALERTS="$TWO" bash "$DEPLOY" firing-critical >"$WORK/firing" 2>&1 && [ "$(wc -l <"$WORK/firing")" = 2 ] && pass "firing-critical lists both" || { failed "firing-critical"; cat "$WORK/firing"; }

echo "window: checks repeat"
VERIFY_WINDOW_SECONDS=130 VERIFY_INTERVAL_SECONDS=60 run && pass "passes" || { failed "window should pass"; cat "$WORK/out"; }
[ "$(wc -l <"$WORK/sleep.log")" -ge 2 ] && pass "slept between passes" || failed "no repetition"

exit "$FAILED"
