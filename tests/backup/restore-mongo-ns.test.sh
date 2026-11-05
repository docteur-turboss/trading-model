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
notrefused_audit() { ! has "hash chain"; }
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
check "scratch: admin excluded" called "--nsExclude admin.*"
check "scratch: name printed" has "restore_${TS}_<db>"

run --components mongodb --allow-mixed-runs --into-scratch
check "scratch alone: every namespace" called "--nsInclude *"

run --ns dlq.dead_letters
check "--ns with default components refused" refused "only apply to --components mongodb"
run --components mongodb --ns dlq.dead_letters --until 2026-01-01
check "--ns with --until refused" refused "cannot be combined with --until"
run --components mongodb --ns audit.audit_events
check "audit in place refused" refused "hash chain"
for pat in 'a*.*' '*dit.*' 'au*.x' '*.x' '*.*' 'audit.*'; do
	run --components mongodb --ns "$pat"
	check "audit glob $pat refused in place" refused "hash chain"
done
run --components mongodb --ns 'dlq.*'
check "non-audit glob not refused as audit" notrefused_audit
run --components mongodb --ns 'bad pattern'
check "malformed pattern refused" refused "expected <db>.<collection>"
run --components mongodb --allow-mixed-runs --ns audit.audit_events --into-scratch
check "audit into scratch allowed" test "$RC" -eq 0

# A run manifest, so that `latest` resolves to that run.
mkdir -p "$WORK/backups/manifests"
{
	echo "{\"version\":1,\"timestamp\":\"$TS\",\"entries\":["
	for l in mongodb mongodb-audit; do
		f="mongodb/$TS/$l.archive.gz"
		echo "{\"component\":\"$l\",\"path\":\"$f\",\"size\":$(wc -c <"$WORK/backups/$f" | tr -d ' '),\"sha256\":\"$(sha256sum "$WORK/backups/$f" | cut -d' ' -f1)\"},"
	done | sed '$ s/,$//'
	echo "]}"
} >"$WORK/backups/manifests/manifest_$TS.json"
# No --timestamp: the scratch name comes from the run found, never "latest".
: >"$WORK/calls"
OUT="$(env PATH="$WORK/bin:$PATH" BACKUP_DIR="$WORK/backups" CALLS="$WORK/calls" 	bash "$ROOT/scripts/restore-k8s.sh" --components mongodb --allow-mixed-runs --into-scratch 2>&1)"
RC=$?
check "scratch without --timestamp: exit 0" test "$RC" -eq 0
check "scratch without --timestamp: real stamp" called "restore_${TS}_\$db\$.\$coll\$"
check "scratch without --timestamp: not latest" notcalled "restore_latest"

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failure(s)"; exit 1; }
echo "restore mongo ns: all checks passed"
