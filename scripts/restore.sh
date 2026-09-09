#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Docker)
#  Usage:  bash scripts/restore.sh [--dry-run] [--components mongodb,mysql,redis]
#          BACKUP_DIR=./backups RESTORE_TIMESTAMP=2025-01-01_120000
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RESTORE_TIMESTAMP="${RESTORE_TIMESTAMP:-latest}"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,checkpoints"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --components) COMPONENTS="$2"; shift 2 ;;
    --timestamp) RESTORE_TIMESTAMP="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

log()  { echo "[$(date +%H:%M:%S)] $*"; }
ok()   { log "✓ $*"; }
fail() { log "✗ $*"; }
warn() { log "⚠ $*"; }

resolve_latest() {
  local dir="$1"
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    local latest
    latest=$(find "${BACKUP_DIR}/${dir}" -maxdepth 1 -type d 2>/dev/null | sort | tail -1)
    echo "$latest"
  else
    echo "${BACKUP_DIR}/${dir}/${RESTORE_TIMESTAMP}"
  fi
}

validate_file() {
  local file="$1"
  local label="$2"
  if [ ! -f "$file" ] && [ ! -d "$file" ]; then
    fail "${label} not found: ${file}"
    return 1
  fi
  if [ -f "$file" ] && [ ! -s "$file" ]; then
    fail "${label} is empty: ${file}"
    return 1
  fi
  return 0
}

restore_mongodb() {
  log "Starting MongoDB restore..."
  local src
  src=$(resolve_latest "mongodb")
  if [ -z "$src" ] || [ ! -d "$src" ]; then
    warn "No MongoDB backup found at ${src}, skipping"
    return
  fi
  log "Restoring from: ${src}"

  for container in trading-mongodb-primary trading-mongodb-dlq; do
    if ! docker ps --filter "name=${container}" --format '{{.Names}}' | grep -q .; then
      warn "Container ${container} not running, skipping"
      continue
    fi

    local archive="${src}/${container}.archive.gz"
    if [ ! -f "$archive" ]; then
      warn "No backup file for ${container} at ${archive}, trying directory"
      local dir="${src}/${container}"
      if [ -d "$dir" ] && [ -n "$(ls -A "$dir" 2>/dev/null)" ]; then
        archive="$dir"
      else
        warn "No backup found for ${container}, skipping"
        continue
      fi
    fi

    if $DRY_RUN; then
      warn "[DRY-RUN] Would restore MongoDB: ${container} from ${archive}"
      continue
    fi

    validate_file "$archive" "${container} backup" || continue

    if [ -f "$archive" ] && [[ "$archive" == *.archive.gz ]]; then
      docker cp "$archive" "${container}:/tmp/restore.archive.gz"
      docker exec "${container}" mongorestore --gzip --drop --archive="/tmp/restore.archive.gz" 2>/dev/null
      docker exec "${container}" rm -f "/tmp/restore.archive.gz"
    elif [ -d "$archive" ]; then
      docker cp "$archive/." "${container}:/tmp/restore_data/"
      docker exec "${container}" mongorestore --gzip --drop "/tmp/restore_data/" 2>/dev/null
      docker exec "${container}" rm -rf "/tmp/restore_data/"
    fi

    if [ $? -eq 0 ]; then
      ok "MongoDB restore complete: ${container}"
      log "Verifying restore..."
      docker exec "${container}" mongosh --quiet --eval "db.getSiblingDB('admin').adminCommand('ping')" 2>/dev/null && ok "MongoDB ${container} responsive"
    else
      fail "MongoDB restore failed: ${container}"
    fi
  done
}

restore_mysql() {
  log "Starting MySQL restore..."
  local file="${BACKUP_DIR}/mysql/financial_scraper_${RESTORE_TIMESTAMP}.sql.gz"
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${BACKUP_DIR}/mysql" -name "financial_scraper_*.sql.gz" 2>/dev/null | sort | tail -1)
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No MySQL backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  if ! docker ps --filter "name=trading-mysql" --format '{{.Names}}' | grep -q .; then
    warn "MySQL container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore MySQL from ${file}"
    return
  fi

  validate_file "$file" "MySQL backup" || return

  gunzip < "$file" | docker exec -i trading-mysql mysql --user=root --password="${MYSQL_ROOT_PASSWORD:-changeme}" 2>/dev/null
  if [ $? -eq 0 ]; then
    ok "MySQL restore complete"
    log "Verifying restore..."
    docker exec trading-mysql mysqlcheck --user=root --password="${MYSQL_ROOT_PASSWORD:-changeme}" --all-databases 2>/dev/null && ok "MySQL integrity check passed"
  else
    fail "MySQL restore failed"
  fi
}

restore_redis() {
  log "Starting Redis restore..."
  local dest="${BACKUP_DIR}/redis"
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${dest}" -name "*.rdb" 2>/dev/null | sort | tail -1)
  else
    file="${dest}/trading-redis-primary_${RESTORE_TIMESTAMP}.rdb"
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    file="${dest}/redis-primary_${RESTORE_TIMESTAMP}.rdb"
  fi

  if [ ! -f "$file" ]; then
    warn "No Redis backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  if ! docker ps --filter "name=trading-redis-primary" --format '{{.Names}}' | grep -q .; then
    warn "Redis primary container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore Redis from ${file}"
    return
  fi

  validate_file "$file" "Redis backup" || return

  log "Stopping Redis primary..."
  docker stop trading-redis-primary 2>/dev/null
  docker cp "$file" trading-redis-primary:/data/dump.rdb 2>/dev/null
  log "Starting Redis primary..."
  docker start trading-redis-primary 2>/dev/null
  sleep 2
  local keys
  keys=$(docker exec trading-redis-primary redis-cli DBSIZE 2>/dev/null)
  ok "Redis restore complete — ${keys} keys"
}

restore_checkpoints() {
  local file="${BACKUP_DIR}/checkpoints/checkpoints_${RESTORE_TIMESTAMP}.tar.gz"
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${BACKUP_DIR}/checkpoints" -name "checkpoints_*.tar.gz" 2>/dev/null | sort | tail -1)
  fi
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No checkpoints backup found, skipping"
    return
  fi

  if ! docker ps --filter "name=trading-trainer" --format '{{.Names}}' | grep -q .; then
    warn "Trainer container not running, copying file for manual restore: ${file}"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore checkpoints from ${file}"
    return
  fi

  docker cp "$file" trading-trainer:/tmp/checkpoints.tar.gz
  docker exec trading-trainer mkdir -p /data/checkpoints
  docker exec trading-trainer tar xzf /tmp/checkpoints.tar.gz -C /data/checkpoints/
  docker exec trading-trainer rm -f /tmp/checkpoints.tar.gz
  ok "Checkpoints restore complete"
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Restore"
echo "  Backup Dir: ${BACKUP_DIR}"
echo "  Timestamp: ${RESTORE_TIMESTAMP}"
echo "  Components: ${COMPONENTS}"
echo "══════════════════════════════════════════════════"
echo ""

IFS=',' read -ra PARTS <<< "$COMPONENTS"
for part in "${PARTS[@]}"; do
  case "$part" in
    mongodb)     restore_mongodb ;;
    mysql)       restore_mysql ;;
    redis)       restore_redis ;;
    checkpoints) restore_checkpoints ;;
    *)           warn "Unknown component: ${part}" ;;
  esac
done

echo ""
echo "══════════════════════════════════════════════════"
echo "  Restore complete!"
echo "══════════════════════════════════════════════════"
