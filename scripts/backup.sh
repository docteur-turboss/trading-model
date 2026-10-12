#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Backup Script (Linux / CI)
#  Usage:  bash scripts/backup.sh [--dry-run] [--components mongodb,mysql,redis,spire]
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,checkpoints,spire"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
METRICS_FILE="${METRICS_FILE:-}"
BACKUP_SUCCESS=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --components) COMPONENTS="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { log "✓ $*"; }
fail() { log "✗ $*"; }
warn() { log "⚠ $*"; }

write_metric() {
  local component="$1" status="$2"
  if [ -n "$METRICS_FILE" ]; then
    mkdir -p "$(dirname "$METRICS_FILE")"
    echo "backup_last_success_timestamp{component=\"${component}\"} $(date +%s)" >> "$METRICS_FILE"
    echo "backup_last_status{component=\"${component}\"} ${status}" >> "$METRICS_FILE"
  fi
}

wait_for_bgsave() {
  local container="$1" max_wait="${2:-30}" elapsed=0
  while [ "$elapsed" -lt "$max_wait" ]; do
    local bg
    bg=$(docker exec "${container}" redis-cli LASTSAVE 2>/dev/null || echo "")
    if [ -n "$bg" ]; then
      return 0
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
  return 1
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

    local mongodump_args=(--gzip --out="/tmp/backup_${TIMESTAMP}")
    if docker exec "${container}" mongosh --quiet --eval "rs.status().ok" 2>/dev/null | grep -q "1"; then
      mongodump_args+=(--oplog)
    fi

    if docker exec "${container}" mongodump "${mongodump_args[@]}" 2>/dev/null; then
      docker cp "${container}:/tmp/backup_${TIMESTAMP}/." "${dest}/${container}/" 2>/dev/null
      docker exec "${container}" rm -rf "/tmp/backup_${TIMESTAMP}" 2>/dev/null
      ok "MongoDB backup complete: ${container}"
      write_metric "mongodb" 1
      BACKUP_SUCCESS=1
    else
      fail "MongoDB backup failed: ${container}"
      write_metric "mongodb" 0
    fi
  done
}

backup_mysql() {
  log "Starting MySQL backup..."
  local dest="${BACKUP_DIR}/mysql"
  mkdir -p "$dest"
  local file="${dest}/financial_scraper_${TIMESTAMP}.sql.gz"

  if ! docker ps --filter "name=trading-mysql" --format '{{.Names}}' | grep -q .; then
    warn "MySQL container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup MySQL to ${file}"
    return
  fi

  if docker exec trading-mysql mysqldump \
    --user=root --password="${MYSQL_ROOT_PASSWORD:-changeme}" \
    --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | \
    gzip > "$file"; then
    ok "MySQL backup complete: ${file}"
    write_metric "mysql" 1
    BACKUP_SUCCESS=1
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

    if docker exec "${container}" redis-cli BGSAVE 2>/dev/null; then
      if wait_for_bgsave "${container}" 30; then
        local file="${dest}/${container}_${TIMESTAMP}.rdb"
        docker cp "${container}:/data/dump.rdb" "$file" 2>/dev/null
        ok "Redis backup complete: ${container}"
        write_metric "redis" 1
        BACKUP_SUCCESS=1
      else
        fail "Redis backup failed: BGSAVE did not complete within 30s: ${container}"
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
  local file="${dest}/checkpoints_${TIMESTAMP}.tar.gz"

  if ! docker ps --filter "name=trading-trainer" --format '{{.Names}}' | grep -q .; then
    warn "Trainer container not running, skipping checkpoints backup"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup checkpoints from trading-trainer"
    return
  fi

  if docker exec trading-trainer tar czf - -C /data/checkpoints . 2>/dev/null > "$file"; then
    ok "Checkpoints backup complete: ${file}"
    write_metric "checkpoints" 1
    BACKUP_SUCCESS=1
  else
    fail "Checkpoints backup failed (directory may be empty)"
    write_metric "checkpoints" 0
  fi
}

backup_spire() {
  log "Starting SPIRE CA key backup..."
  local dest="${BACKUP_DIR}/spire"
  mkdir -p "$dest"
  local file="${dest}/keys_${TIMESTAMP}.json"

  if ! docker ps --filter "name=trading-spire-server" --format '{{.Names}}' | grep -q .; then
    warn "SPIRE server container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup SPIRE CA key from trading-spire-server"
    return
  fi

  if docker cp "trading-spire-server:/run/spire/data/keys.json" "$file" 2>/dev/null && [ -s "$file" ]; then
    ok "SPIRE CA key backup complete: ${file}"
    write_metric "spire" 1
    BACKUP_SUCCESS=1
  else
    fail "SPIRE CA key backup failed"
    write_metric "spire" 0
  fi
}

upload_to_s3() {
  if [ -z "$S3_BUCKET" ]; then
    return
  fi
  log "Uploading backups to S3: ${S3_BUCKET}"

  if command -v aws &>/dev/null; then
    aws s3 sync "${BACKUP_DIR}" "${S3_BUCKET}/$(date +%Y/%m/%d)/" --quiet
    ok "S3 upload complete"
  elif command -v rclone &>/dev/null; then
    rclone copy "${BACKUP_DIR}" "${S3_BUCKET}/$(date +%Y/%m/%d)/" --quiet
    ok "S3 upload complete via rclone"
  else
    warn "Neither aws nor rclone CLI found — skipping S3 upload"
  fi
}

prune_old() {
  log "Pruning backups older than ${RETENTION_DAYS} days..."
  find "${BACKUP_DIR}" -type d -mtime "+${RETENTION_DAYS}" -exec rm -rf {} + 2>/dev/null || true
  ok "Old backups pruned"
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
upload_to_s3

if [ -n "$METRICS_FILE" ] && [ "$BACKUP_SUCCESS" -eq 1 ]; then
  echo "backup_last_run_timestamp $(date +%s)" >> "$METRICS_FILE"
  ok "Metrics written to ${METRICS_FILE}"
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  Backup complete!"
echo "  Location: ${BACKUP_DIR}"
echo "══════════════════════════════════════════════════"
