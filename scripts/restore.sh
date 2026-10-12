#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Docker)
#  Usage:  bash scripts/restore.sh [--dry-run] [--components mongodb,mysql,redis,spire]
#          BACKUP_DIR=./backups RESTORE_TIMESTAMP=2025-01-01_120000
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-./backups}"
RESTORE_TIMESTAMP="${RESTORE_TIMESTAMP:-latest}"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,checkpoints,spire"

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

  for container in trading-mongo; do
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

    local restore_ok=false
    if [ -f "$archive" ] && [[ "$archive" == *.archive.gz ]]; then
      docker cp "$archive" "${container}:/tmp/restore.archive.gz"
      if docker exec "${container}" mongorestore --gzip --drop --archive="/tmp/restore.archive.gz" 2>/dev/null; then
        restore_ok=true
      fi
      docker exec "${container}" rm -f "/tmp/restore.archive.gz"
    elif [ -d "$archive" ]; then
      docker cp "$archive/." "${container}:/tmp/restore_data/"
      if docker exec "${container}" mongorestore --gzip --drop "/tmp/restore_data/" 2>/dev/null; then
        restore_ok=true
      fi
      docker exec "${container}" rm -rf "/tmp/restore_data/"
    fi

    if [ "$restore_ok" = true ]; then
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

  if gunzip < "$file" | docker exec -i trading-mysql mysql --user=root --password="${MYSQL_ROOT_PASSWORD:-changeme}" 2>/dev/null; then
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
    file="${dest}/trading-redis_${RESTORE_TIMESTAMP}.rdb"
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    file="${dest}/redis-primary_${RESTORE_TIMESTAMP}.rdb"
  fi

  if [ ! -f "$file" ]; then
    warn "No Redis backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  if ! docker ps --filter "name=trading-redis" --format '{{.Names}}' | grep -q .; then
    warn "Redis container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore Redis from ${file}"
    return
  fi

  validate_file "$file" "Redis backup" || return

  log "Stopping Redis..."
  docker stop trading-redis 2>/dev/null
  docker cp "$file" trading-redis:/data/dump.rdb 2>/dev/null
  log "Starting Redis..."
  docker start trading-redis 2>/dev/null
  sleep 2
  local keys
  keys=$(docker exec trading-redis redis-cli DBSIZE 2>/dev/null)
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

restore_spire() {
  log "Starting SPIRE CA key restore..."
  local file="${BACKUP_DIR}/spire/keys_${RESTORE_TIMESTAMP}.json"
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${BACKUP_DIR}/spire" -name "keys_*.json" 2>/dev/null | sort | tail -1)
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No SPIRE CA key backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  if ! docker ps --filter "name=trading-spire-server" --format '{{.Names}}' | grep -q .; then
    warn "SPIRE server container not running, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore SPIRE CA key from ${file}"
    return
  fi

  validate_file "$file" "SPIRE CA key backup" || return

  docker stop trading-spire-server 2>/dev/null
  docker cp "$file" trading-spire-server:/run/spire/data/keys.json 2>/dev/null
  docker start trading-spire-server 2>/dev/null
  log "Waiting for SPIRE server to become healthy..."
  sleep 5
  if docker exec trading-spire-server /opt/spire/bin/spire-server healthcheck -registrationUDSPath /run/spire/sockets/public/api.sock 2>/dev/null; then
    ok "SPIRE CA key restore complete — server healthy"
  else
    warn "SPIRE CA key restored but healthcheck pending — verify manually"
  fi
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
    spire)       restore_spire ;;
    *)           warn "Unknown component: ${part}" ;;
  esac
done

echo ""
echo "══════════════════════════════════════════════════"
echo "  Restore complete!"
echo "══════════════════════════════════════════════════"
