#!/usr/bin/env bash
# =============================================================================
#  Trading Model — MySQL retention job (ADR-0051, issue #534).
#  Deletes market data and signals older than the retention period from
#  `financial_scraper`, table by table, in bounded batches. Idempotent: a rerun
#  (or a run after a crash) deletes only what is still too old.
#
#  Run daily by the db-retention CronJob (K8s, image backup-tools); on compose
#  see docs/deployment/BACKUP_DR.md "Retention job". Needs the `mysql` client.
#
#  Env (all documented in docs/deployment/ENV.md):
#    MYSQL_HOST (mysql-primary)  MYSQL_PORT (3306)  MYSQL_USER (retention)
#    MYSQL_PWD (password)        MYSQL_DATABASE (financial_scraper)
#    RETENTION_DAYS (1827)       RETENTION_SIGNALS_DAYS (= RETENTION_DAYS)
#    RETENTION_BATCH_SIZE (10000)  RETENTION_PAUSE_SECONDS (1)
#    METRICS_FILE (unset = no metrics)
#  Exits 1 when any table fails; the other tables are still purged.
# =============================================================================
set -euo pipefail

MYSQL_HOST="${MYSQL_HOST:-mysql-primary}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_USER="${MYSQL_USER:-retention}"
MYSQL_DATABASE="${MYSQL_DATABASE:-financial_scraper}"
RETENTION_DAYS="${RETENTION_DAYS:-1827}"
RETENTION_SIGNALS_DAYS="${RETENTION_SIGNALS_DAYS:-$RETENTION_DAYS}"
RETENTION_BATCH_SIZE="${RETENTION_BATCH_SIZE:-10000}"
RETENTION_PAUSE_SECONDS="${RETENTION_PAUSE_SECONDS:-1}"
METRICS_FILE="${METRICS_FILE:-}"

log() { echo "[retention] $*"; }

# A bad value must stop the run before any DELETE (a 0 would purge everything).
require_int() { # <name> <value> <min>
  case "$2" in "" | *[!0-9]*) log "$1 must be an integer, got '$2'" >&2; exit 1 ;; esac
  [ "$2" -ge "$3" ] || { log "$1 must be >= $3, got $2" >&2; exit 1; }
}
require_int RETENTION_DAYS "$RETENTION_DAYS" 1
require_int RETENTION_SIGNALS_DAYS "$RETENTION_SIGNALS_DAYS" 1
require_int RETENTION_BATCH_SIZE "$RETENTION_BATCH_SIZE" 1
require_int RETENTION_PAUSE_SECONDS "$RETENTION_PAUSE_SECONDS" 0

# Table, date column and retention days: explicit, never derived.
TARGETS=(
  "market_candles timestamp ${RETENTION_DAYS}"
  "market_trades timestamp ${RETENTION_DAYS}"
  "market_tickers timestamp ${RETENTION_DAYS}"
  "market_order_books timestamp ${RETENTION_DAYS}"
  "signals observed_at ${RETENTION_SIGNALS_DAYS}"
)

# Prints the rows deleted by one batch. The session turns invisible indexes on:
# the `timestamp` indexes are INVISIBLE (migration 0000), without it each batch
# would scan the whole table.
purge_batch() { # <table> <column> <days>
  mysql -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$MYSQL_USER" -N -B "$MYSQL_DATABASE" -e \
    "SET SESSION optimizer_switch='use_invisible_indexes=on';
     DELETE FROM \`$1\` WHERE \`$2\` < UTC_TIMESTAMP(3) - INTERVAL $3 DAY LIMIT ${RETENTION_BATCH_SIZE};
     SELECT ROW_COUNT();"
}

failures=0
start=$(date +%s)
declare -A deleted
for target in "${TARGETS[@]}"; do
  read -r table column days <<<"$target"
  total=0
  while true; do
    if ! rows=$(purge_batch "$table" "$column" "$days"); then
      log "ERROR ${table}: batch failed after ${total} rows" >&2
      failures=$((failures + 1))
      break
    fi
    total=$((total + rows))
    [ "$rows" -lt "$RETENTION_BATCH_SIZE" ] && break
    sleep "$RETENTION_PAUSE_SECONDS"
  done
  deleted[$table]=$total
  log "${table}: ${total} rows older than ${days} days deleted"
done
duration=$(($(date +%s) - start))

if [ -n "$METRICS_FILE" ]; then
  mkdir -p "$(dirname "$METRICS_FILE")"
  now=$(date +%s)
  status=1
  last_success=$now
  if [ "$failures" -gt 0 ]; then
    status=0
    # A failure keeps the previous success time, so the staleness alert fires.
    last_success=$(grep '^retention_last_success_timestamp ' "$METRICS_FILE" 2>/dev/null | awk '{print $2}' | tail -1 || true)
    last_success="${last_success:-0}"
  fi
  {
    for table in "${!deleted[@]}"; do
      echo "retention_last_run_rows_deleted{table=\"${table}\"} ${deleted[$table]}"
    done
    echo "retention_last_success_timestamp ${last_success}"
    echo "retention_last_status ${status}"
    echo "retention_last_run_duration_seconds ${duration}"
  } >"${METRICS_FILE}.tmp"
  mv "${METRICS_FILE}.tmp" "$METRICS_FILE"
fi

[ "$failures" -eq 0 ] || exit 1
