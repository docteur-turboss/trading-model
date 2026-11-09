#!/usr/bin/env bash
# probe_availability (issue #703) against a stub kubectl whose port-forward
# serves HTTP from a node process: 200 -> 0 failures, 503 -> failures > 0,
# every route of PROBE_ROUTES is requested (ADR-0058), and the key never
# reaches the output.
#   bash tests/k8s/probe-availability.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'kill $(jobs -p) 2>/dev/null || true; rm -rf "$WORK"' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }

mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# `port-forward svc/x PORT:8080`: serve the status code in $STUB_STATUS_FILE.
port="${@: -1}"; port="${port%%:*}"
exec node -e '
const fs = require("fs");
require("http").createServer((q, r) => {
  fs.appendFileSync(process.env.STUB_PATHS_FILE, `${q.url}\n`);
  r.statusCode = Number(fs.readFileSync(process.env.STUB_STATUS_FILE, "utf8"));
  r.end();
}).listen(Number(process.argv[1]));' "$port"
STUB
chmod +x "$WORK/bin/kubectl"
export STUB_STATUS_FILE="$WORK/status" STUB_PATHS_FILE="$WORK/paths" PROBE_PORT=18459
K="$WORK/bin/kubectl" NS=test API_KEY="secret-key-value"
# shellcheck source=tests/k8s/probe-availability.sh
. "$ROOT/tests/k8s/probe-availability.sh"

run() { # $1 = status code, $2 = seconds
	echo "$1" >"$STUB_STATUS_FILE"
	rm -f "$WORK/stop" "$WORK/count"
	probe_availability "$WORK/stop" "$WORK/count" >"$WORK/log" 2>&1 &
	local pid=$!
	sleep "$2"
	touch "$WORK/stop"
	wait "$pid" || true
	read -r requests failures <"$WORK/count"
}

run 200 3
[ "$requests" -ge 1 ] && [ "$failures" = 0 ] && ok "200: $requests requests, 0 failed" || ko "200: $requests requests, $failures failed"

for route in /v1/discovery-server/services /v1/trader-trainer/training-status "/v2/financial-scraper/candles/symbols/BTCUSDT?limit=1"; do
	grep -qxF "$route" "$WORK/paths" && ok "requested $route" || ko "never requested $route"
done

run 503 3
[ "$failures" -ge 1 ] && ok "503: $failures of $requests failed" || ko "503 not detected: $requests requests, $failures failed"

! grep -q "secret-key-value" "$WORK/log" && ok "key not logged" || ko "key leaked in the log"

exit "$FAILED"
