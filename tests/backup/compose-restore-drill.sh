#!/usr/bin/env bash
# Restore drill for the Docker scripts (scripts/backup.sh, scripts/restore.sh):
# seeds known data and an audit trail written by the audit-logger image code,
# backs up with a throwaway age key, destroys the containers AND their
# volumes, recreates them empty, restores, and checks that the data, the
# audit trail (same events, same hashes, chain verified) and the SPIRE trust
# bundle came back. Used by backup-test.yml; runs locally
# too (needs docker and age; refuses to run next to a compose stack, since
# the scripts target the fixed container names trading-*).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export COMPOSE_PROJECT_NAME="backupdrill"
export MYSQL_ROOT_PASSWORD="drill-root"
export GRAFANA_PASSWORD="drill-grafana"
export MYSQL_EXPORTER_PASSWORD="drill-exporter"
SERVICES="mongo mysql redis spire-server"
WORK="$(mktemp -d)"
# Git Bash: a C:/... path is understood by bash and by the native age/docker.
if command -v cygpath >/dev/null; then WORK="$(cygpath -m "$WORK")"; fi
# Relative compose path: survives MSYS_NO_PATHCONV=1 (local runs on Git Bash).
cd "$ROOT"
COMPOSE="docker compose -f docker-compose.yml"

log() { echo "[drill] $*"; }
# shellcheck source=drill-timings.sh
source "$ROOT/tests/backup/drill-timings.sh"
die() {
	log "FAILED: $*"
	exit 1
}

cleanup() {
	$COMPOSE down -v --rmi local --remove-orphans >/dev/null 2>&1 || true
	rm -rf "$WORK"
}

for name in trading-mongo trading-mysql trading-redis trading-spire-server; do
	project="$(docker inspect -f '{{index .Config.Labels "com.docker.compose.project"}}' "$name" 2>/dev/null || true)"
	if [ -n "$project" ] && [ "$project" != "$COMPOSE_PROJECT_NAME" ]; then
		die "container $name belongs to compose project '$project': stop it first"
	fi
done
trap cleanup EXIT

start() {
	# shellcheck disable=SC2086
	$COMPOSE up -d --wait --wait-timeout 300 $SERVICES >/dev/null
}

mongo_eval() { docker exec trading-mongo mongosh --quiet --eval "$1"; }
mysql_q() { docker exec trading-mysql sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql --user=root -N -e \"$1\""; }
# The audit trail: tests/backup/audit-chain.js on audit-logger's database.
audit_chain() { mongo_eval "const AUDIT_DB = 'audit-logger'; $(cat tests/backup/audit-chain.js)"; }
json_field() { node -e 'const v = JSON.parse(require("fs").readFileSync(0, "utf8"))[process.argv[1]]; console.log(v === null ? "null" : v)' "$1"; }
spire_bundle() { docker exec trading-spire-server /opt/spire/bin/spire-server bundle show -socketPath /run/spire/sockets/api.sock | sha256sum | cut -d' ' -f1; }

drill_begin docker
log "building audit-logger (its code writes the audit trail)"
$COMPOSE build -q audit-logger
log "starting ${SERVICES}"
start

log "seeding known data"
for db in message-manager audit-logger dlq; do
	mongo_eval "db.getSiblingDB('${db}').restore_drill.insertMany([{_id: 1, db: '${db}'}, {_id: 2}, {_id: 3}])" >/dev/null
done
mysql_q "CREATE DATABASE restore_drill; CREATE TABLE restore_drill.markers (id INT PRIMARY KEY, label VARCHAR(32)); INSERT INTO restore_drill.markers VALUES (1, 'drill'), (2, 'drill'), (3, 'drill');"
docker exec trading-redis redis-cli SET restore_drill marker >/dev/null
bundle_before="$(spire_bundle)"

log "seeding an audit trail (audit-logger code: legacy events, then current ones)"
$COMPOSE run --rm --no-deps -T --entrypoint node audit-logger - <tests/backup/seed-audit-chain.cjs >/dev/null
audit_before="$(audit_chain)"
[ "$(echo "$audit_before" | json_field broken)" = "null" ] || die "the seeded audit chain does not verify: $audit_before"
[ "$(echo "$audit_before" | json_field count)" = "25" ] || die "expected 25 audit events: $audit_before"
[ "$(mongo_eval "db.getSiblingDB('audit-logger').audit_events.countDocuments({'metadata.correlationId': null})")" -gt 0 ] ||
	die "no legacy event (correlationId null): the verifier rule for them is not exercised"

key="$(age-keygen 2>/dev/null)"
echo "$key" >"$WORK/identity"
chmod 600 "$WORK/identity"
recipient="$(echo "$key" | sed -n 's/^# public key: //p')"

log "backup (age-encrypted)"
BACKUP_DIR="$WORK/backups" BACKUP_AGE_RECIPIENTS="$recipient" BACKUP_REQUIRE_ENCRYPTION=true \
	drill_time backup bash "$ROOT/scripts/backup.sh" --components mongodb,mysql,redis,spire
clear="$(find "$WORK/backups" -type f ! -name '*.age')"
[ -z "$clear" ] || die "unencrypted backup files: $clear"

log "disaster: containers and volumes deleted, recreated empty"
drill_disaster
$COMPOSE down -v >/dev/null
drill_time recreate_empty_stack start
[ "$(mongo_eval "db.getSiblingDB('dlq').restore_drill.countDocuments()")" = "0" ] || die "MongoDB was not wiped"
[ "$(spire_bundle)" != "$bundle_before" ] || die "the recreated SPIRE server kept its CA"
[ "$(audit_chain | json_field count)" = "0" ] || die "the audit trail survived the disaster"

log "restore"
BACKUP_DIR="$WORK/backups" BACKUP_AGE_IDENTITY="$WORK/identity" \
	drill_time restore bash "$ROOT/scripts/restore.sh" --components mongodb,mysql,redis,spire

log "checking the restored data"
verify_started=$SECONDS
for db in message-manager audit-logger dlq; do
	count="$(mongo_eval "db.getSiblingDB('${db}').restore_drill.countDocuments()")"
	[ "$count" = "3" ] || die "MongoDB ${db}: ${count} documents instead of 3"
done
[ "$(mysql_q "SELECT COUNT(*) FROM restore_drill.markers WHERE label = 'drill'")" = "3" ] || die "MySQL markers missing"
[ "$(docker exec trading-redis redis-cli GET restore_drill)" = "marker" ] || die "Redis key missing"
[ "$(spire_bundle)" = "$bundle_before" ] || die "the SPIRE trust bundle differs: the CA was not restored"
audit_after="$(audit_chain)"
for field in count first last digest broken; do
	[ "$(echo "$audit_after" | json_field "$field")" = "$(echo "$audit_before" | json_field "$field")" ] ||
		die "the restored audit trail differs ($field): before $audit_before, after $audit_after"
done

drill_record verify_data $((SECONDS - verify_started))
# Default budget 300 s: about 5 times the 20 s recovery window of the first CI
# run (a few KB of data), see tests/backup/drill-timings.sh.
drill_finish 300

log "OK: MongoDB (3 databases, audit chain intact), MySQL, Redis and the SPIRE CA restored from encrypted backups"
