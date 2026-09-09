#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Backup Script (Linux / CI)
#  Usage:  bash scripts/backup.sh [--dry-run] [--components mongodb,mysql,redis]
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,checkpoints"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"

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

backup_mongodb() {
  log "Starting MongoDB backup..."
  local dest="${BACKUP_DIR}/mongodb/${TIMESTAMP}"
  mkdir -p "$dest"

  for container in trading-mongodb-primary trading-mongodb-dlq; do
    if ! docker ps --filter "name=${container}" --format '{{.Names}}' | grep -q .; then
      warn "Container ${container} not running, skipping"
      continue
    fi

    if $DRY_RUN; then
      warn "[DRY-RUN] Would backup MongoDB: ${container}"
      continue
    fi

    docker exec "${container}" mongodump --gzip --oplog --out="/tmp/backup_${TIMESTAMP}" 2>/dev/null
    if [ $? -eq 0 ]; then
      docker cp "${container}:/tmp/backup_${TIMESTAMP}/." "${dest}/${container}/" 2>/dev/null
      docker exec "${container}" rm -rf "/tmp/backup_${TIMESTAMP}" 2>/dev/null
      ok "MongoDB backup complete: ${container}"
    else
      fail "MongoDB backup failed: ${container}"
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
  else
    fail "MySQL backup failed"
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
      sleep 2
      local file="${dest}/${container}_${TIMESTAMP}.rdb"
      docker cp "${container}:/data/dump.rdb" "$file" 2>/dev/null
      ok "Redis backup complete: ${container}"
    else
      fail "Redis backup failed: ${container}"
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
  else
    fail "Checkpoints backup failed (directory may be empty)"
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
    *)           warn "Unknown component: ${part}" ;;
  esac
done

prune_old
upload_to_s3

echo ""
echo "══════════════════════════════════════════════════"
echo "  Backup complete!"
echo "  Location: ${BACKUP_DIR}"
echo "══════════════════════════════════════════════════"
