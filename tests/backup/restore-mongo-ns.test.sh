#!/usr/bin/env bash
# Selective MongoDB restore of scripts/restore-k8s.sh (issue #335): --ns and
# --into-scratch change the mongorestore arguments, refusals exit 1, and
# without them the arguments stay exactly the historical ones. Fake kubectl
# in the PATH records the mongorestore command line.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILURES=0
TS=2026-01-01_000000

mkdir -p "$WORK/bin" "$WORK/backups/mongodb/$TS"
for l in mongodb mongodb-audit; do echo x | gzip >"$WORK/backups/mongodb/$TS/$l.archive.gz"; done
cat >"$WORK/bin/kubectl" <<'K'
#!/usr/bin/env bash
case "$1" in
  get) echo -n "mongo-0" ;;
  exec)
    if [[ "$*" == *mongosh* ]]; then echo true
    elif [[ "$*" == *mongorestore* ]]; then cat >/dev/null; echo "${*#*mongorestore}" >>"$CALLS"; fi ;;
esac
exit 0
K
chmod +x "$WORK/bin/kubectl"

run() {
	: >"$WORK/calls"
	OUT="$(env PATH="$WORK/bin:$PATH" BACKUP_DIR="$WORK/backups" CALLS="$WORK/calls" \
		bash "$ROOT/scripts/restore-k8s.sh" --timestamp "$TS" "$@" 2>&1)"
	RC=$?
}
check() {
	local name="$1"
	shift
	if "$@"; then echo "  ✓ $name"; else echo "  ✗ $name"; FAILURES=$((FAILURES + 1)); fi
}
called() { grep -qF -- "$1" "$WORK/calls"; }
notcalled() { ! grep -qF -- "$1" "$WORK/calls"; }
has() { grep -qF -- "$1" <<<"$OUT"; }
refused() { [ "$RC" -eq 1 ] && has "$1"; }

run --components mongodb --allow-mixed-runs
check "default: historical arguments" called " --quiet --gzip --archive --drop --oplogReplay"
check "default: no ns option" notcalled "--nsInclude"

run --components mongodb --allow-mixed-runs --ns dlq.dead_letters --ns 'dlq.x*'
check "--ns: exit 0" test "$RC" -eq 0
check "--ns: nsInclude per pattern" called "--nsInclude dlq.dead_letters --nsInclude dlq.x*"
check "--ns: still --drop" called "--drop"
check "--ns: no oplogReplay" notcalled "--oplogReplay"
check "--ns: no rename" notcalled "--nsTo"

run --components mongodb --allow-mixed-runs --ns dlq.dead_letters --into-scratch
check "scratch: nsFrom/nsTo" called "--nsFrom \$db\$.\$coll\$ --nsTo restore_${TS}_\$db\$.\$coll\$"
check "scratch: name printed" has "restore_${TS}_<db>"

run --components mongodb --allow-mixed-runs --into-scratch
check "scratch alone: every namespace" called "--nsInclude *"

run --ns dlq.dead_letters
check "--ns with default components refused" refused "only apply to --components mongodb"
run --components mongodb --ns dlq.dead_letters --until 2026-01-01
check "--ns with --until refused" refused "cannot be combined with --until"
run --components mongodb --ns audit.audit_events
check "audit in place refused" refused "hash chain"
run --components mongodb --ns 'bad pattern'
check "malformed pattern refused" refused "expected <db>.<collection>"
run --components mongodb --allow-mixed-runs --ns audit.audit_events --into-scratch
check "audit into scratch allowed" test "$RC" -eq 0

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failure(s)"; exit 1; }
echo "restore mongo ns: all checks passed"
