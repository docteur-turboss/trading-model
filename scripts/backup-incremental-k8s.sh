#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Incremental Backup (Kubernetes): MySQL binlogs and MongoDB
#  oplogs for point-in-time recovery (ADR-0031). Run every hour by the
#  db-backup-incremental CronJob: RPO 1 h.
#  Usage:  bash scripts/backup-incremental-k8s.sh [--components mysql,mongodb,mongodb-audit]
#          BACKUP_DIR=/backups BACKUP_AGE_RECIPIENTS=age1... BACKUP_S3_BUCKET=s3://...
#          INCREMENTAL_RETENTION_HOURS=72 (archives older than that are deleted:
#          past 72 h only the daily dumps of backup-k8s.sh remain)
#
#  MySQL: FLUSH BINARY LOGS, then every closed binlog not archived yet is read
#  from mysql-0's volume, compressed and sealed. MongoDB: the oplog entries
#  since the end of the previous archive, from each replica set's primary.
#  The state is in the archive names only (see backup-lib.sh).
#  Exits 1 when any step fails, a gap in the archives included.
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M%S)"
COMPONENTS="mysql,mongodb,mongodb-audit"
INCREMENTAL_RETENTION_HOURS="${INCREMENTAL_RETENTION_HOURS:-72}"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"
METRICS_FILE="${METRICS_FILE:-}"
BACKUP_RUN="incremental"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --components) COMPONENTS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

# stdout: binlog file `$2` of MySQL pod `$1`, gzipped.
binlog_stream() {
  kubectl_exec "$1" -c mysql -- cat "$2" | gzip
}

mysql_query() {
  mysql_root_sh "$1" "mysql --user=root -N -e '$2'"
}

archive_binlogs() {
  log "Archiving MySQL binlogs..."
  local pod
  if ! pod=$(mysql_primary_pod); then
    fail "No MySQL pod found"
    write_metric "mysql-binlog" 0
    return
  fi
  local uuid basename logs
  if ! uuid=$(mysql_query "$pod" 'SELECT @@server_uuid') || [ -z "$uuid" ] ||
    ! basename=$(mysql_query "$pod" 'SELECT @@log_bin_basename') || [ -z "$basename" ] ||
    ! mysql_query "$pod" 'FLUSH BINARY LOGS' >/dev/null ||
    ! logs=$(mysql_query "$pod" 'SHOW BINARY LOGS' | awk '{print $1}'); then
    fail "Cannot read the binary logs of ${pod}"
    write_metric "mysql-binlog" 0
    return
  fi
  # One directory per server: a recreated volume restarts the numbering.
  local dest="${BACKUP_DIR}/mysql/binlog/${uuid}"
  mkdir -p "$dest"
  local last first status=1 count=0
  last=$(binlog_archives "$dest" | tail -1 | awk '{print $1}')
  first=$(echo "$logs" | head -1)
  first=$((10#${first##*.}))
  if [ -n "$last" ] && [ "$first" -gt $((last + 1)) ]; then
    fail "Binlogs $((last + 1)) to $((first - 1)) of ${uuid} were purged before being archived: point-in-time restore is impossible across that gap"
    status=0
  fi
  local file index
  # The last binlog is the one the flush just opened: still being written.
  for file in $(echo "$logs" | sed '$d'); do
    index=$((10#${file##*.}))
    if [ -n "$last" ] && [ "$index" -le "$last" ]; then
      continue
    fi
    local out="${dest}/${file}_${TIMESTAMP}.gz${AGE_SUFFIX}"
    if sealed_write "$out" binlog_stream "$pod" "$(dirname "$basename")/${file}"; then
      record_output "$out"
      count=$((count + 1))
    else
      fail "Archiving binlog ${file} failed"
      status=0
      # Later binlogs would leave a hole behind them: retried next run.
      break
    fi
  done
  [ "$status" -eq 1 ] && ok "MySQL binlogs archived: ${count} file(s) (server ${uuid})"
  write_metric "mysql-binlog" "$status"
}

# stdout: oplog entries `$2` to `$3` (inclusive) of MongoDB pod `$1`, gzipped BSON.
oplog_stream() {
  kubectl_exec "$1" -c mongodb -- mongodump --quiet --db local --collection oplog.rs \
    --query "{\"ts\":{\"\$gte\":$(oplog_json "$2"),\"\$lte\":$(oplog_json "$3")}}" --out - | gzip
}

archive_oplog() {
  local label="$1" component="$1-oplog"
  log "Archiving the ${label} oplog..."
  local primary
  if ! primary=$(mongo_primary "$label"); then
    fail "No writable MongoDB primary for ${label}"
    write_metric "$component" 0
    return
  fi
  local oldest end
  if ! oldest=$(oplog_edge "$primary" 1) || ! end=$(oplog_edge "$primary" -1) ||
    ! [[ "$oldest" =~ ^[0-9]+\.[0-9]+$ && "$end" =~ ^[0-9]+\.[0-9]+$ ]]; then
    fail "Cannot read the oplog of ${primary}"
    write_metric "$component" 0
    return
  fi
  local dest="${BACKUP_DIR}/mongodb/oplog/${label}"
  mkdir -p "$dest"
  local from status=1
  from=$(oplog_archives "$dest" | tail -1 | awk '{print $2}')
  if [ -z "$from" ]; then
    from="$oldest"
  elif ! oplog_le "$oldest" "$from"; then
    # The oplog is a ring: entries after the last archive were overwritten.
    fail "The ${label} oplog no longer holds ${from} (oldest entry ${oldest}): entries were lost, the chain restarts at ${oldest}"
    status=0
    from="$oldest"
  fi
  if [ "$from" = "$end" ]; then
    ok "MongoDB ${label} oplog: nothing new since ${end}"
  else
    local out="${dest}/${from}_${end}.bson.gz${AGE_SUFFIX}" after
    if ! sealed_write "$out" oplog_stream "$primary" "$from" "$end"; then
      fail "Archiving the ${label} oplog failed (${primary})"
      status=0
    elif ! after=$(oplog_edge "$primary" 1) || ! [[ "$after" =~ ^[0-9]+\.[0-9]+$ ]] ||
      ! oplog_le "$after" "$from"; then
      # The ring turned during the dump: entries from ${from} on may have been
      # overwritten before mongodump read them. Nothing is kept, the next run
      # finds the loss and reports it.
      rm -f "$out"
      fail "The ${label} oplog no longer holds ${from} after the dump (oldest entry ${after:-unreadable}): archive discarded"
      status=0
    else
      record_output "$out"
      ok "MongoDB ${label} oplog archived: ${from} to ${end} (${primary})"
    fi
  fi
  write_metric "$component" "$status"
}

# Publishes backup_pitr_gap for each archived store: 1 while its chain is
# broken after the newest daily dump (a binlog purged or oplog entries
# overwritten before being archived), so no point-in-time restore can reach
# the instants after the break until the next daily dump. Read from the names
# only, it stays at 1 on the next runs, which succeed again (alert
# BackupPitrGap, BACKUP_DR.md).
report_pitr_gaps() {
  local part store dir component
  for part in "${PARTS[@]}"; do
    case "$part" in
      mysql)
        local uuid_dir
        # The current server's chain: the newest directory written to.
        uuid_dir=$(find "${BACKUP_DIR}/mysql/binlog" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' 2>/dev/null |
          sort -n | tail -1 | cut -d' ' -f2-)
        store=mysql dir="$uuid_dir" component=mysql-binlog ;;
      mongodb | mongodb-audit)
        store="$part" dir="${BACKUP_DIR}/mongodb/oplog/${part}" component="${part}-oplog" ;;
      *) continue ;;
    esac
    if [ -n "$dir" ] && pitr_broken "$store" "$dir"; then
      fail "${component}: the archive chain is broken after the newest daily dump: no point-in-time restore past the break until the next daily dump"
      write_pitr_gap "$component" 1
    else
      write_pitr_gap "$component" 0
    fi
  done
}

# Deletes the archives older than INCREMENTAL_RETENTION_HOURS and the
# `.partial` files a killed run left behind.
prune_incremental() {
  log "Pruning incremental archives older than ${INCREMENTAL_RETENTION_HOURS} h..."
  local dir
  for dir in "${BACKUP_DIR}/mysql/binlog" "${BACKUP_DIR}/mongodb/oplog"; do
    [ -d "$dir" ] || continue
    find "$dir" -type f -name '*.partial' -delete
    find "$dir" -type f -mmin "+$((INCREMENTAL_RETENTION_HOURS * 60))" -delete
    find "$dir" -mindepth 1 -type d -empty -delete
  done
  ok "Old incremental archives pruned"
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Incremental Backup (K8s)"
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
    mysql)                   archive_binlogs ;;
    mongodb | mongodb-audit) archive_oplog "$part" ;;
    *)                       fail "Unknown component: ${part}"; write_metric "$part" 0 ;;
  esac
done

# After archiving: the newest archive of a chain is never pruned before the
# run that continues it, so a gap cannot hide behind an emptied directory.
prune_incremental
report_pitr_gaps
# Every archive still here, not only this run's: a copy that failed earlier
# is caught up now, so the chain off-site has no hole.
record_incremental_archives
upload_offsite
finalize_metrics

echo ""
if [ "$BACKUP_FAILURES" -gt 0 ]; then
  fail "${BACKUP_FAILURES} incremental backup step(s) failed"
  exit 1
fi
ok "Incremental backup complete"
