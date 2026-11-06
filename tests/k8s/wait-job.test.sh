#!/usr/bin/env bash
# deploy/k8s/scripts/wait-job.sh (issue #434) against a stub kubectl:
# Complete -> 0, Failed -> 1 at once (logs shown), neither -> 2 at the timeout.
#   bash tests/k8s/wait-job.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/deploy/k8s/scripts/wait-job.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }

mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# `get job` prints $STUB_STATE; `logs` prints a marker.
case "$1" in
get) printf '%s' "$STUB_STATE" ;;
logs) echo "JOB-LOGS" ;;
esac
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH" WAIT_JOB_INTERVAL=1

run() { STUB_STATE="$1" bash "$SCRIPT" ns db-migrate "${2:-5}" 2>&1; }

out="$(run 'Complete ')" && ok "Complete -> exit 0" || ko "Complete: $out"

start=$SECONDS
out="$(run 'Failed ' 30)" && rc=0 || rc=$?
[ "$rc" = 1 ] && [ $((SECONDS - start)) -lt 5 ] && [[ $out == *JOB-LOGS* ]] &&
	ok "Failed -> exit 1 at once, logs shown" || ko "Failed: rc=$rc $out"

out="$(run '' 2)" && rc=0 || rc=$?
[ "$rc" = 2 ] && [[ $out == *"timed out"* && $out == *JOB-LOGS* ]] &&
	ok "no condition -> exit 2 at the timeout, logs shown" || ko "timeout: rc=$rc $out"

exit "$FAILED"
