#!/usr/bin/env bash
# purge_expired_rows of scripts/restore-k8s.sh (issue #743): a Job that fails
# fast ends the wait at once (backoffLimit 0), a completed Job passes.
# Fake kubectl: `wait --for=condition=failed` returns when the scenario is
# "fail", `--for=condition=complete` when it is "ok"; the other one sleeps.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'K'
#!/usr/bin/env bash
case "$1" in
  create) ;;
  wait)
    want=complete; [ "$SCENARIO" = fail ] && want=failed
    if [[ "$*" == *"condition=$want"* ]]; then exit 0; fi
    exec sleep 60 ;;
  get) [ "$SCENARIO" = ok ] && echo -n 1 ;;
  logs) echo "retention: mysql is read-only" ;;
esac
exit 0
K
chmod +x "$WORK/bin/kubectl"

# Extract the function only: the script itself needs a cluster.
sed -n '/^purge_expired_rows() {/,/^}/p' "$ROOT/scripts/restore-k8s.sh" >"$WORK/fn.sh"
FAILURES=0
run() { # scenario -> prints "rc elapsed"
	local start=$SECONDS rc
	( export SCENARIO="$1" PATH="$WORK/bin:$PATH" K8S_NAMESPACE=t RETENTION_WAIT=4h; RUN_RETENTION=true
	  log() { :; }; ok() { :; }; warn() { :; }; fail() { echo "FAIL: $*" >&2; exit 1; }
	  . "$WORK/fn.sh"; purge_expired_rows ) >"$WORK/out" 2>&1
	rc=$?
	echo "$rc $((SECONDS - start))"
}
read -r rc t < <(run ok); [ "$rc" = 0 ] || cat "$WORK/out"
{ [ "$rc" = 0 ] && [ "$t" -lt 10 ]; } || { echo "FAIL ok: rc=$rc t=${t}s"; FAILURES=1; }
read -r rc t < <(run fail)
{ [ "$rc" = 1 ] && [ "$t" -lt 10 ]; } || { echo "FAIL fast-fail: rc=$rc t=${t}s"; FAILURES=1; }
[ "$FAILURES" = 0 ] && echo "restore-retention-purge: OK"
exit "$FAILURES"
