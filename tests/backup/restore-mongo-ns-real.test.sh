#!/usr/bin/env bash
# Selective MongoDB restore against a real mongorestore (issue #335): the
# image pinned in docker-compose.yml runs the commands that
# scripts/restore-k8s.sh builds (fake kubectl forwards `exec` to `docker exec`).
# Proves: --ns restores one collection and leaves the others alone;
# --into-scratch creates restore_<TS>_<db> and leaves the original untouched.
# Needs Docker. Removes its container on exit.
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
NAME="restore-mongo-ns-$$"
TS=2026-01-01_000000
FAILURES=0
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1; rm -rf "$WORK"; }
trap cleanup EXIT

IMAGE="$(grep -m1 -oE 'image: mongo@sha256:[0-9a-f]+' "$ROOT/docker-compose.yml" | cut -d' ' -f2)"
[ -n "$IMAGE" ] || { echo "no mongo image in docker-compose.yml"; exit 1; }
# Authentication on (ADR-0059): restore-k8s.sh restores as `root`, whose
# password is in the pod's env (MONGO_ROOT_PASSWORD).
docker run -d --name "$NAME" -e MONGO_INITDB_ROOT_USERNAME=root -e MONGO_INITDB_ROOT_PASSWORD=pw -e MONGO_ROOT_PASSWORD=pw "$IMAGE" >/dev/null || exit 1
AUTH=(-u root -p pw --authenticationDatabase admin)
for _ in $(seq 1 90); do
	docker exec "$NAME" mongosh --quiet "${AUTH[@]}" --eval 'db.runCommand({ping:1}).ok' 2>/dev/null | grep -q 1 && break
	sleep 1
done
sh_() { docker exec "$NAME" mongosh --quiet "${AUTH[@]}" --eval "$1"; }
count() { sh_ "db.getSiblingDB('$1').getCollection('$2').countDocuments({})" | tr -d '\r'; }

sh_ "db.getSiblingDB('dlq').dead_letters.insertMany([{a:1},{a:2},{a:3}]);
db.getSiblingDB('dlq').other.insertMany([{b:1}]);
db.getSiblingDB('audit').audit_events.insertMany([{c:1},{c:2}])" >/dev/null

mkdir -p "$WORK/bin" "$WORK/backups/mongodb/$TS"
docker exec "$NAME" mongodump --quiet --gzip --archive "${AUTH[@]}" >"$WORK/backups/mongodb/$TS/mongodb.archive.gz" || exit 1
cp "$WORK/backups/mongodb/$TS/mongodb.archive.gz" "$WORK/backups/mongodb/$TS/mongodb-audit.archive.gz"

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
		bash "$ROOT/scripts/restore-k8s.sh" --timestamp "$TS" --allow-mixed-runs --components mongodb "$@" 2>&1)"
	RC=$?
}
check() {
	local name="$1"
	shift
	if "$@"; then echo "  ✓ $name"; else echo "  ✗ $name"; FAILURES=$((FAILURES + 1)); fi
}
eq() { [ "$1" = "$2" ]; }

# Damage after the dump: lost documents, plus healthy new data elsewhere.
sh_ "db.getSiblingDB('dlq').dead_letters.deleteMany({});
db.getSiblingDB('dlq').other.insertOne({b:2});
db.getSiblingDB('audit').audit_events.insertOne({c:3})" >/dev/null

restore --ns dlq.dead_letters
check "--ns: exit 0" eq "$RC" 0
check "--ns: collection restored" eq "$(count dlq dead_letters)" 3
check "--ns: other collection untouched (new doc kept)" eq "$(count dlq other)" 2
check "--ns: audit untouched (new doc kept)" eq "$(count audit audit_events)" 3

sh_ "db.getSiblingDB('dlq').dead_letters.deleteMany({a:1})" >/dev/null
restore --into-scratch
check "scratch: exit 0" eq "$RC" 0
check "scratch: name printed" grep -qF "restore_${TS}_" <<<"$OUT"
check "scratch: dlq copy has the dumped data" eq "$(count "restore_${TS}_dlq" dead_letters)" 3
check "scratch: audit copy has the dumped data" eq "$(count "restore_${TS}_audit" audit_events)" 2
check "scratch: original dlq untouched" eq "$(count dlq dead_letters)" 2
check "scratch: original audit untouched" eq "$(count audit audit_events)" 3

[ "$FAILURES" -eq 0 ] || { echo "$FAILURES failure(s)"; exit 1; }
echo "restore mongo ns (real mongorestore): all checks passed"
