#!/usr/bin/env bash
# The error output of a failing dump command reaches the log (issue #332):
# kubectl_exec keeps stderr, kubectl_exec_probe hides it. No secret appears.
# Needs bash.
#   bash tests/backup/backup-stderr.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "  ✓ $*"; }
failed() {
	echo "  ✗ $*"
	FAILED=1
}

log() { echo "[test] $*" >&2; }
ok() { log "$*"; }
fail() { log "$*"; }
warn() { log "$*"; }
# shellcheck source=../../scripts/backup-lib.sh
source "$ROOT/scripts/backup-lib.sh"

# Fake kubectl: prints a diagnostic on stderr and fails.
mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'EOF'
#!/usr/bin/env bash
echo "mongodump: Failed: authentication failed" >&2
exit 1
EOF
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH"
K8S_NAMESPACE=test

out="$(kubectl_exec pod -- mongodump 2>&1 >/dev/null || true)"
if [[ "$out" == *"authentication failed"* ]]; then
	pass "kubectl_exec keeps the tool's stderr"
else
	failed "kubectl_exec hid stderr: '$out'"
fi

out="$(kubectl_exec_probe pod -- mongosh 2>&1 >/dev/null || true)"
if [[ -z "$out" ]]; then
	pass "kubectl_exec_probe hides stderr"
else
	failed "kubectl_exec_probe leaked stderr: '$out'"
fi

if declare -f mysql_root_sh | grep -q 'MYSQL_PWD' && ! declare -f mysql_root_sh | grep -q 'MYSQL_ROOT_PASSWORD}'; then
	pass "mysql_root_sh reads the password inside the pod (never on a command line)"
else
	failed "mysql_root_sh no longer uses MYSQL_PWD from the pod environment"
fi

if grep -nE '2>/dev/null' "$ROOT/scripts/backup-k8s.sh" "$ROOT/scripts/backup.sh" | grep -E 'dump|tar|keys.json'; then
	failed "a dump command still discards stderr"
else
	pass "no dump command discards stderr in backup-k8s.sh / backup.sh"
fi

exit "$FAILED"
