#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Backup Script (Linux / CI)
#  Usage:  bash scripts/backup.sh [--dry-run] [--components mongodb,mysql,redis,spire]
#          BACKUP_AGE_RECIPIENTS=age1... (encryption, see backup-lib.sh)
#          RETENTION_DAYS, RETENTION_WEEKLY_WEEKS, RETENTION_MONTHLY_MONTHS,
#          BACKUP_OFFSITE_LAYOUT (GFS retention, see backup-lib.sh, ADR-0032)
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,checkpoints,spire"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
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

# Waits until LASTSAVE moves past `$2` (its value before BGSAVE).
wait_for_bgsave() {
  local container="$1" before="$2" max_wait="${3:-30}" elapsed=0
  while [ "$elapsed" -lt "$max_wait" ]; do
    local lastsave
    lastsave=$(docker exec "${container}" redis-cli --raw LASTSAVE 2>/dev/null || echo "")
    if [ -n "$lastsave" ] && [ "$lastsave" != "$before" ]; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
}

# Gzipped dump of every non-system database of trading-mysql, with the
# container's own password: never on a command line.
mysql_dump_gz() {
  docker exec trading-mysql sh -c "export MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\"; ${MYSQL_DUMP_SH}" | gzip
}

backup_mongodb() {
  log "Starting MongoDB backup..."
  local dest="${BACKUP_DIR}/mongodb/${TIMESTAMP}"
  mkdir -p "$dest"

  for container in trading-mongo; do
    if ! docker ps --filter "name=${container}" --format '{{.Names}}' | grep -q .; then
      warn "Container ${container} not running, skipping"
      continue
    fi

    if $DRY_RUN; then
      warn "[DRY-RUN] Would backup MongoDB: ${container}"
      continue
    fi

    local file="${dest}/${container}.archive.gz${AGE_SUFFIX}"
    local mongodump_args=(--gzip --archive)
    if docker exec "${container}" mongosh --quiet --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then
      mongodump_args+=(--oplog)
    fi

    # The `backup` user (ADR-0066); the password stays in the container's env.
    if write_dump mongodb "$file" docker exec "${container}" sh -c "mongodump --quiet ${mongodump_args[*]} --username backup --password \"\$MONGO_BACKUP_PASSWORD\" --authenticationDatabase admin"; then
      ok "MongoDB backup complete: ${container}"
      write_metric "mongodb" 1
      # One mongod in compose: this dump holds the audit-logger database too.
      write_metric "mongodb-audit" 1
    else
      fail "MongoDB backup failed: ${container}"
      write_metric "mongodb" 0
      write_metric "mongodb-audit" 0
    fi
  done
}

backup_mysql() {
  log "Starting MySQL backup..."
  local dest="${BACKUP_DIR}/mysql"
  mkdir -p "$dest"
  local file="${dest}/financial_scraper_${TIMESTAMP}.sql.gz${AGE_SUFFIX}"

  if ! docker ps --filter "name=trading-mysql" --format '{{.Names}}' | grep -q .; then
    warn "MySQL container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup MySQL to ${file}"
    return
  fi

  if write_dump mysql "$file" mysql_dump_gz; then
    ok "MySQL backup complete: ${file}"
    write_metric "mysql" 1
  else
    fail "MySQL backup failed"
    write_metric "mysql" 0
  fi
}

backup_redis() {
  log "Starting Redis backup..."
  local dest="${BACKUP_DIR}/redis"
  mkdir -p "$dest"

  for container in $(docker ps --filter "name=trading-redis" --format '{{.Names}}' 2>/dev/null); do
    if $DRY_RUN; then
      warn "[DRY-RUN] Would backup Redis: ${container}"
      continue
    fi

    local before
    before=$(docker exec "${container}" redis-cli --raw LASTSAVE 2>/dev/null || echo "")
    if docker exec "${container}" redis-cli BGSAVE >/dev/null 2>&1; then
      local file="${dest}/${container}_${TIMESTAMP}.rdb${AGE_SUFFIX}"
      if ! wait_for_bgsave "${container}" "${before}" 30; then
        fail "Redis backup failed: BGSAVE did not complete within 30s: ${container}"
        write_metric "redis" 0
      elif write_dump "redis:${container}" "$file" docker exec "${container}" cat /data/dump.rdb; then
        ok "Redis backup complete: ${container}"
        write_metric "redis" 1
      else
        fail "Redis backup failed: could not read dump.rdb: ${container}"
        write_metric "redis" 0
      fi
    else
      fail "Redis backup failed: ${container}"
      write_metric "redis" 0
    fi
  done
}

backup_checkpoints() {
  log "Starting trader-trainer checkpoints backup..."
  local dest="${BACKUP_DIR}/checkpoints"
  mkdir -p "$dest"
  local file="${dest}/checkpoints_${TIMESTAMP}.tar.gz${AGE_SUFFIX}"

  if ! docker ps --filter "name=trading-trainer" --format '{{.Names}}' | grep -q .; then
    warn "Trainer container not running, skipping checkpoints backup"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup checkpoints from trading-trainer"
    return
  fi

  if write_dump checkpoints "$file" docker exec trading-trainer tar czf - -C /data/checkpoints .; then
    ok "Checkpoints backup complete: ${file}"
    write_metric "checkpoints" 1
  else
    fail "Checkpoints backup failed (directory may be empty)"
    write_metric "checkpoints" 0
  fi
}

# The whole data directory: keys.json (CA private keys) and the SQLite
# datastore (bundle, CA journal, entries) only work together. The server is
# paused while it is copied, so the datastore is consistent.
backup_spire() {
  log "Starting SPIRE server backup (CA keys + datastore)..."
  local dest="${BACKUP_DIR}/spire"
  mkdir -p "$dest"
  local file="${dest}/data_${TIMESTAMP}.tar${AGE_SUFFIX}"

  if ! docker ps --filter "name=trading-spire-server" --format '{{.Names}}' | grep -q .; then
    warn "SPIRE server container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup the SPIRE data directory from trading-spire-server"
    return
  fi

  # The SPIRE image has no shell: `docker cp` to stdout yields a tar stream.
  docker pause trading-spire-server >/dev/null
  if write_dump spire "$file" docker cp "trading-spire-server:/run/spire/data" -; then
    docker unpause trading-spire-server >/dev/null
    ok "SPIRE server backup complete: ${file}"
    write_metric "spire" 1
  else
    docker unpause trading-spire-server >/dev/null
    fail "SPIRE server backup failed"
    write_metric "spire" 0
  fi
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Backup"
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
    mongodb)     backup_mongodb ;;
    mysql)       backup_mysql ;;
    redis)       backup_redis ;;
    checkpoints) backup_checkpoints ;;
    spire)       backup_spire ;;
    *)           warn "Unknown component: ${part}" ;;
  esac
done

prune_old
# Before the off-site copy, which sends the manifest along with the dumps. A
# failure is counted by write_metric (component "manifest"): the run exits 1.
$DRY_RUN || write_manifest || true
upload_offsite
# Compose has no point-in-time recovery (no incremental job): BackupIncrementalMissing stays quiet.
[ -z "$_METRICS_TMP" ] || echo "backup_pitr_supported 0" >>"$_METRICS_TMP"
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
