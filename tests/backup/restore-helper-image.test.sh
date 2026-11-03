#!/usr/bin/env bash
# Helper-pod image of scripts/restore-k8s.sh (issue #323): the image of the
# db-backup CronJob without override, a warned fallback to :latest when the
# CronJob is absent, RESTORE_HELPER_IMAGE first. Fake kubectl in the PATH.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILURES=0
DIGEST="ghcr.io/trading-model/backup-tools@sha256:0123456789abcdef"

mkdir -p "$WORK/bin" "$WORK/backups"
cat >"$WORK/bin/kubectl" <<'K'
#!/usr/bin/env bash
if [ "$1" = get ] && [ "$2" = cronjob ] && [ -n "${FAKE_CRONJOB_IMAGE:-}" ]; then
  echo -n "$FAKE_CRONJOB_IMAGE"
  exit 0
fi
exit 1
K
chmod +x "$WORK/bin/kubectl"

# run <env assignments...>: dry run of the spire component, output in $OUT.
run() {
	OUT="$(env PATH="$WORK/bin:$PATH" BACKUP_DIR="$WORK/backups" "$@" \
		bash "$ROOT/scripts/restore-k8s.sh" --dry-run --components spire --timestamp 2026-01-01_000000 2>&1)"
}
check() {
	local name="$1"
	shift
	if "$@"; then echo "  ✓ $name"; else echo "  ✗ $name"; FAILURES=$((FAILURES + 1)); fi
}
has() { grep -qF -- "$1" <<<"$OUT"; }
hasnt() { ! grep -qF -- "$1" <<<"$OUT"; }

run FAKE_CRONJOB_IMAGE="$DIGEST"
check "CronJob present: header shows its digest" has "Helper image: ${DIGEST}"
check "CronJob present: no fallback warning" hasnt "falls back"

run FAKE_CRONJOB_IMAGE=
check "CronJob absent: falls back to :latest" has "Helper image: ghcr.io/trading-model/backup-tools:latest"
check "CronJob absent: warns" has "falls back"

run FAKE_CRONJOB_IMAGE="$DIGEST" RESTORE_HELPER_IMAGE=registry.example/custom:1
check "override wins" has "Helper image: registry.example/custom:1"
check "override: CronJob not used" hasnt "$DIGEST"

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failure(s)"; exit 1; }
echo "restore helper image: all checks passed"
