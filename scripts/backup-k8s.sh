#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Backup Script (Kubernetes)
#  Usage:  bash scripts/backup-k8s.sh [--dry-run] [--components mongodb,mysql,checkpoints,spire,risk]
#          BACKUP_DIR=/backups BACKUP_S3_BUCKET=s3://my-bucket/backups
#          BACKUP_AGE_RECIPIENTS=age1... (encryption, see backup-lib.sh)
#          RETENTION_DAYS, RETENTION_WEEKLY_WEEKS, RETENTION_MONTHLY_MONTHS,
#          BACKUP_OFFSITE_LAYOUT (GFS retention, see backup-lib.sh, ADR-0032)
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
# UTC: restore-k8s.sh --until compares these stamps with the requested instant.
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
COMPONENTS="mongodb,mysql,checkpoints,spire,risk"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"
METRICS_FILE="${METRICS_FILE:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --components) COMPONENTS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

# Sets DUMP_ROWS for the next write_dump: {"<db>.<table>":<rows>,...} from
# "name<TAB>count" lines on stdin. Without counts the manifest entry simply has
# no rows (warned): the dump itself is not blocked.
rows_from_counts() {
  DUMP_ROWS="$(awk -F'	' 'NF==2 && $2 ~ /^[0-9]+$/ { printf "%s\"%s\":%s", (n++ ? "," : ""), $1, $2 } END { if (n) printf "}" }' | sed 's/^/{/')" || true
  [ -n "$DUMP_ROWS" ] || warn "row counts unavailable: manifest entry without rows"
}

backup_mongodb() {
  log "Starting MongoDB backup..."
  local dest="${BACKUP_DIR}/mongodb/${TIMESTAMP}"
  mkdir -p "$dest"

  # One dump per replica set, from its primary: every member holds the same data.
  local label primary
  for label in mongodb mongodb-audit; do
    if ! primary=$(mongo_primary "$label"); then
      fail "No writable MongoDB primary for ${label}"
      write_metric "$label" 0
      continue
    fi
    if $DRY_RUN; then
      warn "[DRY-RUN] Would backup MongoDB ${label} from ${primary}"
      continue
    fi
    # Point-in-time recovery replays the archived oplog from this point on
    # (ADR-0031): read before the dump, so nothing between the two is missed.
    local start
    if ! start=$(oplog_edge "$primary" -1) || ! [[ "$start" =~ ^[0-9]+\.[0-9]+$ ]]; then
      fail "Cannot read the oplog of ${label} (${primary})"
      write_metric "$label" 0
      continue
    fi
    local coll=audit.audit_events
    [ "$label" = mongodb ] && coll=dlq.dlq_entries
    rows_from_counts < <(mongo_tool backup "${primary}" mongosh --quiet --eval       "print('${coll}	' + db.getSiblingDB('${coll%%.*}').${coll#*.}.countDocuments({}))")
    local file="${dest}/${label}.archive.gz${AGE_SUFFIX}"
    local pitr="${dest}/${label}.pitr${AGE_SUFFIX}"
    if write_dump "$label" "$file" mongo_tool backup "${primary}" mongodump --quiet --gzip --archive --oplog &&
      sealed_write "$pitr" echo "oplog_ts=${start}"; then
      ok "MongoDB backup complete: ${label} (${primary}, oplog from ${start})"
      record_output "$pitr"
      write_metric "$label" 1
    else
      fail "MongoDB backup failed: ${label} (${primary})"
      write_metric "$label" 0
    fi
  done
}

# Gzipped dump of every non-system database from MySQL pod `$1`. Point-in-time
# recovery replays the archived binlogs from the dump's own coordinates
# (ADR-0031): --source-data=2 writes them as a comment at the top of the
# dump, copied to file `$2` on the way through.
mysql_dump_gz() {
  mysql_root_sh "$1" "$MYSQL_DUMP_SH --source-data=2" |
    awk -v out="$2" '!found && /^-- CHANGE (REPLICATION SOURCE|MASTER) TO/ { print > out; close(out); found = 1 } { print }' |
    gzip
}

mysql_core_dump_gz() {
  mysql_root_sh "$1" "$MYSQL_CORE_DUMP_SH" | mysql_core_if_not_exists | gzip
}

backup_mysql() {
  log "Starting MySQL backup..."
  local dest="${BACKUP_DIR}/mysql"
  mkdir -p "$dest"
  local file="${dest}/financial_scraper_${TIMESTAMP}.sql.gz${AGE_SUFFIX}"

  local pod
  if ! pod=$(mysql_primary_pod); then
    fail "No MySQL pod found"
    write_metric "mysql" 0
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup MySQL from ${pod}"
    return
  fi

  local uuid coords pitr="${dest}/financial_scraper_${TIMESTAMP}.pitr${AGE_SUFFIX}"
  if ! uuid=$(mysql_root_sh "${pod}" "mysql --user=root -N -e 'SELECT @@server_uuid'") || [ -z "$uuid" ]; then
    fail "MySQL backup failed: cannot read the server uuid of ${pod}"
    write_metric "mysql" 0
    return
  fi
  coords=$(mktemp)
  local t q=""
  for t in market_candles market_trades market_tickers signals; do
    q="${q:+$q UNION ALL }SELECT 'financial_scraper.$t', COUNT(*) FROM financial_scraper.$t"
  done
  rows_from_counts < <(mysql_root_sh "${pod}" "mysql --user=root -N -e \"$q\"")
  if write_dump mysql "$file" mysql_dump_gz "${pod}" "$coords" &&
    sealed_write "$pitr" mysql_pitr "$uuid" "$coords"; then
    ok "MySQL backup complete: ${file}"
    record_output "$pitr"
    write_metric "mysql" 1
  else
    fail "MySQL backup failed"
    write_metric "mysql" 0
  fi
  rm -f "$coords"
  backup_mysql_core mysql_core_dump_gz "${pod}"
}

# Component `$1`: a tar of the volume of container `$2` (pod of the same
# component), streamed by command `$3...` run in that container.
backup_volume() {
  local key="$1" container="$2"
  shift 2
  log "Starting ${key} backup (${container} volume)..."
  local dest="${BACKUP_DIR}/${key}"
  mkdir -p "$dest"

  local pod
  pod=$(component_pods "$container" | awk '{print $1}')
  if [ -z "$pod" ]; then
    fail "No ${container} pod found"
    write_metric "$key" 0
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup ${key} from ${pod}"
    return
  fi

  local file="${dest}/${key}_${TIMESTAMP}.tar.gz${AGE_SUFFIX}"
  if write_dump "$key" "$file" kubectl_exec "${pod}" -c "$container" -- "$@"; then
    ok "${key} backup complete"
    write_metric "$key" 1
  else
    fail "${key} backup failed"
    write_metric "$key" 0
  fi
}

# One tar (spire/data_<TS>.tar), like the Docker backup: the SQLite datastore
# (bundle, CA journal, entries), snapshotted with `sqlite3 .backup` while the
# server runs, then keys-sqlite.json (CA private keys), read AFTER the
# snapshot on purpose: SPIRE stores a new CA key before journaling it, so the
# key file holds every key that journal refers to (ADR-0065, issue #330).
# Through the spire-entries sidecar (alpine + sqlite): the spire-server image
# has no shell. The snapshot sits in its /tmp (memory) until streamed.
SPIRE_BACKUP_SH=$(cat <<'SH'
set -e
d=$(mktemp -d)
trap 'rm -rf "$d"' EXIT
sqlite3 /run/spire/data/datastore.sqlite3 ".backup $d/datastore.sqlite3"
cp /run/spire/data/keys-sqlite.json "$d/"
tar -C "$d" -cf - datastore.sqlite3 keys-sqlite.json
SH
)

backup_spire() {
  log "Starting SPIRE server backup (datastore + CA keys)..."
  local dest="${BACKUP_DIR}/spire"
  mkdir -p "$dest"

  local pod
  pod=$(component_pods spire-server | awk '{print $1}')
  if [ -z "$pod" ]; then
    fail "No SPIRE server pod found"
    write_metric "spire" 0
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup the SPIRE datastore and CA keys from ${pod}"
    return
  fi

  local file="${dest}/data_${TIMESTAMP}.tar${AGE_SUFFIX}"
  if write_dump spire "$file" kubectl_exec -c spire-entries "${pod}" -- sh -c "$SPIRE_BACKUP_SH"; then
    ok "SPIRE server backup complete: ${file}"
    write_metric "spire" 1
  else
    fail "SPIRE server backup failed"
    write_metric "spire" 0
  fi
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Backup (K8s)"
echo "  Timestamp: ${TIMESTAMP}"
echo "  Backup Dir: ${BACKUP_DIR}"
echo "  Components: ${COMPONENTS}"
echo "══════════════════════════════════════════════════"
echo ""

if ! init_encryption; then
  write_metric "encryption" 0
  finalize_metrics
  exit 1
fi

IFS=',' read -ra PARTS <<< "$COMPONENTS"
for part in "${PARTS[@]}"; do
  case "$part" in
    mongodb)      backup_mongodb ;;
    mysql)        backup_mysql ;;
    checkpoints)  backup_volume checkpoints trader-trainer tar czf - -C /data/checkpoints . ;;
    # *.json only: never a half-written tmp file (JsonFile renames it into place).
    risk)         backup_volume risk risk-execution sh -c 'cd /data/risk-execution && tar czf - *.json' ;;
    spire)        backup_spire ;;
    *)            fail "Unknown component: ${part}"; write_metric "$part" 0 ;;
  esac
done

prune_old
# Before the off-site copy, which sends the manifest along with the dumps. A
# failure is counted by write_metric (component "manifest"): the run exits 1.
$DRY_RUN || write_manifest || true
upload_offsite
write_sealed_key_timestamp
finalize_metrics

echo ""
if [ "$BACKUP_FAILURES" -gt 0 ]; then
  fail "${BACKUP_FAILURES} backup step(s) failed"
  exit 1
fi

echo "══════════════════════════════════════════════════"
echo "  Backup complete!"
echo "  Location: ${BACKUP_DIR}"
echo "══════════════════════════════════════════════════"
