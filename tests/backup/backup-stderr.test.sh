#!/usr/bin/env bash
# The error output of a failing dump command reaches the log (issue #332):
# kubectl_exec keeps stderr, kubectl_exec_probe hides it; backup-k8s.sh and backup.sh surface the dump errors. No secret appears.
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

# --- Behaviour of the scripts themselves (PR #344 review) -------------------
# Each fake tool prints a distinct diagnostic on stderr and fails; the combined
# output of the real script must carry every one, and no secret.
SECRET="s3cr3t-root-pw"
export MYSQL_ROOT_PASSWORD="$SECRET"

cat >"$WORK/bin/kubectl" <<'EOF'
#!/usr/bin/env bash
all="$*"
if [ "$1" = get ]; then
	case "$all" in
	*service*) ;;
	*) echo "pod-0" ;;
	esac
	exit 0
fi
case "$all" in
*isWritablePrimary*) echo true ;;
*oplog.rs*) echo "1700000000.1" ;;
*server_uuid*) echo "uuid-1" ;;
*mysqldump*) echo "mysqldump: FAKE-MYSQL access denied" >&2; exit 2 ;;
*mongodump*) echo "mongodump: FAKE-MONGO authentication failed" >&2; exit 1 ;;
*" tar "*) echo "tar: FAKE-TAR cannot open" >&2; exit 2 ;;
*keys.json*) echo "cat: FAKE-CAT no such file" >&2; exit 1 ;;
esac
exit 0
EOF
cat >"$WORK/bin/docker" <<'EOF'
#!/usr/bin/env bash
all="$*"
case "$1" in
ps) echo "trading-x"; exit 0 ;;
pause | unpause) exit 0 ;;
cp) echo "Error: FAKE-DOCKERCP no such path" >&2; exit 1 ;;
esac
case "$all" in
*mongodump*) echo "mongodump: FAKE-MONGO authentication failed" >&2; exit 1 ;;
*mysqldump*) echo "mysqldump: FAKE-MYSQL access denied" >&2; exit 2 ;;
*" tar "*) echo "tar: FAKE-TAR cannot open" >&2; exit 2 ;;
esac
exit 0
EOF
chmod +x "$WORK/bin/kubectl" "$WORK/bin/docker"

check_output() {
	local name="$1" out="$2" marker
	shift 2
	for marker in "$@"; do
		if [[ "$out" == *"$marker"* ]]; then
			pass "$name shows ${marker}"
		else
			failed "$name hid ${marker}"
		fi
	done
	if [[ "$out" == *"$SECRET"* ]]; then
		failed "$name leaked the root password"
	else
		pass "$name output holds no secret"
	fi
}

out="$(BACKUP_DIR="$WORK/k8s" K8S_NAMESPACE=test bash "$ROOT/scripts/backup-k8s.sh" 2>&1 || true)"
check_output "backup-k8s.sh" "$out" FAKE-MONGO FAKE-MYSQL FAKE-TAR FAKE-CAT

out="$(BACKUP_DIR="$WORK/docker" bash "$ROOT/scripts/backup.sh" --components mongodb,mysql,checkpoints,spire 2>&1 || true)"
check_output "backup.sh" "$out" FAKE-MONGO FAKE-MYSQL FAKE-TAR FAKE-DOCKERCP

exit "$FAILED"
