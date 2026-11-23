#!/usr/bin/env bash
# Selective MongoDB restore against a real mongorestore (issue #335): the
# image pinned in docker-compose.yml runs the commands that
# scripts/restore-k8s.sh builds (fake kubectl forwards `exec` to `docker exec`).
# Proves: --ns restores one collection (into scratch only: in place is refused
# for the audit trail) and leaves the others alone; --into-scratch creates
# restore_<TS>_<db> and leaves the original untouched.
# Needs Docker. Removes its container on exit.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
NAME="restore-mongo-ns-$$"
TS=2026-01-01_000000
FAILURES=0
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT

IMAGE="$(grep -m1 -oE 'image: mongo(:[^@ ]+)?@sha256:[0-9a-f]+' "$ROOT/docker-compose.yml" | cut -d' ' -f2)"
[ -n "$IMAGE" ] || { echo "no mongo image in docker-compose.yml"; exit 1; }
# Authentication on (ADR-0067): restore-k8s.sh restores as `root`, whose
# password is in the pod's env (MONGO_ROOT_PASSWORD).
docker run -d --name "$NAME" -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=pw -e MONGO_ROOT_PASSWORD=pw "$IMAGE" >/dev/null || exit 1
AUTH=(-u root -p pw --authenticationDatabase admin)
for _ in $(seq 1 90); do
	docker exec "$NAME" mongosh --quiet "${AUTH[@]}" --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 && break
	sleep 1
done
sh_() { docker exec "$NAME" mongosh --quiet "${AUTH[@]}" --eval "$1"; }
count() { sh_ "db.getSiblingDB('$1').getCollection('$2').countDocuments({})" | tr -d '\r'; }

sh_ "db.getSiblingDB('audit').audit_events.insertMany([{a:1},{a:2},{a:3}]);
db.getSiblingDB('audit').other.insertMany([{b:1}])" >/dev/null

mkdir -p "$WORK/bin" "$WORK/backups/mongodb/$TS"
docker exec "$NAME" mongodump --quiet --gzip --archive "${AUTH[@]}" >"$WORK/backups/mongodb/$TS/mongodb-audit.archive.gz" || exit 1
# Run manifest: a run without one is refused.
mkdir -p "$WORK/backups/manifests"
{
	echo "{\"version\":1,\"timestamp\":\"$TS\",\"entries\":["
	for l in mongodb-audit; do
		f="mongodb/$TS/$l.archive.gz"
		echo "{\"component\":\"$l\",\"path\":\"$f\",\"size\":$(wc -c <"$WORK/backups/$f" | tr -d ' '),\"sha256\":\"$(sha256sum "$WORK/backups/$f" | cut -d' ' -f1)\"},"
	done | sed '$ s/,$//'
	echo "]}"
} >"$WORK/backups/manifests/manifest_$TS.json"

cat >"$WORK/bin/kubectl" <<K
#!/usr/bin/env bash
case "\$1" in
  get) echo -n "mongo-0" ;;
  exec)
    if [[ "\$*" == *mongosh* ]]; then echo true
    else shift; while [ "\$1" != "--" ]; do shift; done; shift; docker exec -i "$NAME" "\$@"; fi ;;
esac

K
chmod +x "$WORK/bin/kubectl"

restore() {
	OUT="$(env PATH="$WORK/bin:$PATH" BACKUP_DIR="$WORK/backups" \
		bash "$ROOT/scripts/restore-k8s.sh" --timestamp "$TS" --allow-mixed-runs --components mongodb-audit "$@" 2>&1)"
	RC=$?
}
check() {
	local name="$1"
	shift
	if "$@"; then echo "  ✓ $name"; else echo "  ✗ $name"; FAILURES=$((FAILURES + 1)); fi
}
eq() { [ "$1" = "$2" ]; }

# Damage after the dump: lost documents, plus healthy new data elsewhere.
sh_ "db.getSiblingDB('audit').audit_events.deleteMany({});
db.getSiblingDB('audit').other.insertOne({b:2})" >/dev/null

# The audit trail is never restored in place with --ns (hash chain, ADR-0027).
restore --ns audit.audit_events
check "--ns in place: refused" test "$RC" -ne 0
check "--ns in place: nothing touched" eq "$(count audit audit_events)" 0

restore --ns audit.audit_events --into-scratch
check "--ns scratch: exit 0" eq "$RC" 0
check "--ns scratch: name printed" grep -qF "restore_${TS}_" <<<"$OUT"
check "--ns scratch: collection restored" eq "$(count "restore_${TS}_audit" audit_events)" 3
check "--ns scratch: other collection not restored" eq "$(count "restore_${TS}_audit" other)" 0
check "--ns scratch: original untouched" eq "$(count audit other)" 2

sh_ "db.getSiblingDB('restore_${TS}_audit').dropDatabase()" >/dev/null
restore --into-scratch
check "scratch: exit 0" eq "$RC" 0
check "scratch: audit copy has the dumped data" eq "$(count "restore_${TS}_audit" audit_events)" 3
check "scratch: other collection copied" eq "$(count "restore_${TS}_audit" other)" 1
check "scratch: original untouched" eq "$(count audit audit_events)" 0

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failure(s)"; exit 1; }
echo "restore mongo ns (real mongorestore): all checks passed"
