# shellcheck shell=bash
# Shared by the tests/backup/*.test.sh scripts: result lines (a failure sets
# FAILED=1), and the log/ok/fail/warn helpers scripts/backup-lib.sh expects
# its caller to define.
pass() { echo "  ✓ $*"; }
failed() {
	echo "  ✗ $*"
	FAILED=1
}

log() { echo "[test] $*" >&2; }
ok() { log "$*"; }
fail() { log "$*"; }
warn() { log "$*"; }
