#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Docker)
#  Usage:  bash scripts/restore.sh [--dry-run] [--components mongodb,mysql,redis,spire]
#          BACKUP_DIR=./backups RESTORE_TIMESTAMP=2025-01-01_120000
#          BACKUP_AGE_IDENTITY=~/backup-key.txt (to read *.age backups)
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
RESTORE_FAILURES=0
fail() { log "✗ $*"; RESTORE_FAILURES=$((RESTORE_FAILURES + 1)); }
warn() { log "⚠ $*"; }

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

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

    local archive
    archive=$(backup_file "${src}/${container}.archive.gz")
    if [ -z "$archive" ]; then
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
    if [ -f "$archive" ]; then
      if open_backup "$archive" | docker exec -i "${container}" mongorestore --quiet --gzip --drop --archive; then
        restore_ok=true
      fi
    elif [ -d "$archive" ]; then
      docker cp "$archive/." "${container}:/tmp/restore_data/"
      if docker exec "${container}" mongorestore --quiet --gzip --drop "/tmp/restore_data/"; then
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
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(latest_backup "${BACKUP_DIR}/mysql" "financial_scraper_*.sql.gz")
  else
    file=$(backup_file "${BACKUP_DIR}/mysql/financial_scraper_${RESTORE_TIMESTAMP}.sql.gz")
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

  if open_backup "$file" | gunzip | strip_gtid | docker exec -i trading-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root'; then
    ok "MySQL restore complete"
    log "Verifying restore..."
    local tables
    if tables=$(docker exec trading-mysql sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --user=root -N -e "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema NOT IN ('"'"'mysql'"'"', '"'"'sys'"'"', '"'"'information_schema'"'"', '"'"'performance_schema'"'"')"'); then
      ok "MySQL answers: ${tables} application table(s)"
    else
      fail "MySQL does not answer after the restore"
    fi
  else
    fail "MySQL restore failed"
  fi
}

# With the append-only file on (REDIS_APPENDONLY=yes), Redis starts from
# appendonlydir and ignores dump.rdb: load the restored snapshot in a
# throwaway server on the same volume and let it rewrite the AOF from it.
rebuild_redis_aof() {
  local image
  image=$(docker inspect -f '{{.Config.Image}}' trading-redis)
  log "Rebuilding the Redis append-only file from the snapshot..."
  docker run --rm --volumes-from trading-redis --user 999:999 --entrypoint sh "$image" -c '
    set -e
    rm -rf /data/appendonlydir
    redis-server --dir /data --port 6399 --appendonly no --daemonize yes
    until redis-cli -p 6399 ping >/dev/null 2>&1; do sleep 0.2; done
    redis-cli -p 6399 CONFIG SET appendonly yes >/dev/null
    until redis-cli -p 6399 INFO persistence | grep -q "^aof_rewrites:1" &&
      redis-cli -p 6399 INFO persistence | grep -q "^aof_rewrite_in_progress:0"; do
      sleep 0.2
    done
    redis-cli -p 6399 SHUTDOWN >/dev/null 2>&1 || true
  ' >/dev/null
}

restore_redis() {
  log "Starting Redis restore..."
  local dest="${BACKUP_DIR}/redis"
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(latest_backup "${dest}" "*.rdb")
  else
    file=$(backup_file "${dest}/trading-redis_${RESTORE_TIMESTAMP}.rdb")
  fi

  if [ -z "$file" ]; then
    file=$(backup_file "${dest}/redis-primary_${RESTORE_TIMESTAMP}.rdb")
  fi

  if [ -z "$file" ]; then
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

  # The plaintext lives only until the copy is done.
  local plain copied=false aof
  aof=$(docker exec trading-redis redis-cli CONFIG GET appendonly 2>/dev/null | sed -n 2p)
  plain=$(mktemp -d)
  open_backup "$file" > "${plain}/dump.rdb" || { rm -rf "$plain"; fail "Redis restore failed: cannot read ${file}"; return; }
  log "Stopping Redis..."
  docker stop trading-redis >/dev/null
  # A tar stream on stdin: no host path for docker to resolve. 999 = redis user.
  tar -C "$plain" --owner=999 --group=999 -cf - dump.rdb | docker cp - trading-redis:/data && copied=true
  rm -rf "$plain"
  if $copied && [ "$aof" = "yes" ] && ! rebuild_redis_aof; then
    copied=false
  fi
  log "Starting Redis..."
  docker start trading-redis >/dev/null
  if ! $copied; then
    fail "Redis restore failed: could not write dump.rdb into trading-redis"
    return
  fi
  sleep 2
  local keys
  keys=$(docker exec trading-redis redis-cli DBSIZE 2>/dev/null || echo "?")
  ok "Redis restore complete — ${keys} keys"
}

restore_checkpoints() {
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(latest_backup "${BACKUP_DIR}/checkpoints" "checkpoints_*.tar.gz")
  else
    file=$(backup_file "${BACKUP_DIR}/checkpoints/checkpoints_${RESTORE_TIMESTAMP}.tar.gz")
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

  docker exec trading-trainer mkdir -p /data/checkpoints
  open_backup "$file" | docker exec -i trading-trainer tar xzf - -C /data/checkpoints/
  ok "Checkpoints restore complete"
}

# Restores the SPIRE data directory (data_*.tar: CA keys + datastore), or
# keys.json alone from backups taken before 2026-10 (keys_*.json).
restore_spire() {
  log "Starting SPIRE server restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(latest_backup "${BACKUP_DIR}/spire" "data_*.tar")
    [ -n "$file" ] || file=$(latest_backup "${BACKUP_DIR}/spire" "keys_*.json")
  else
    file=$(backup_file "${BACKUP_DIR}/spire/data_${RESTORE_TIMESTAMP}.tar")
    [ -n "$file" ] || file=$(backup_file "${BACKUP_DIR}/spire/keys_${RESTORE_TIMESTAMP}.json")
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No SPIRE backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  if ! docker ps -a --filter "name=trading-spire-server" --format '{{.Names}}' | grep -q .; then
    warn "SPIRE server container not found, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore SPIRE from ${file}"
    return
  fi

  validate_file "$file" "SPIRE backup" || return

  local plain copied=false
  plain=$(mktemp)
  chmod 600 "$plain"
  open_backup "$file" > "$plain" || { rm -f "$plain"; fail "SPIRE restore failed: cannot read ${file}"; return; }
  docker stop trading-spire-server >/dev/null
  case "$file" in
    */data_*) docker cp - trading-spire-server:/run/spire < "$plain" && copied=true ;;
    *) tar -C "$(dirname "$plain")" --transform "s|.*|data/keys.json|" -cf - "$(basename "$plain")" |
      docker cp - trading-spire-server:/run/spire && copied=true ;;
  esac
  rm -f "$plain"
  docker start trading-spire-server >/dev/null
  if ! $copied; then
    fail "SPIRE restore failed: could not write into trading-spire-server"
    return
  fi
  log "Waiting for SPIRE server to become healthy..."
  local attempt
  for attempt in $(seq 1 30); do
    if docker exec trading-spire-server /opt/spire/bin/spire-server healthcheck -socketPath /run/spire/sockets/api.sock >/dev/null 2>&1; then
      ok "SPIRE restore complete — server healthy (attempt ${attempt})"
      return
    fi
    sleep 2
  done
  fail "SPIRE server is not healthy after the restore"
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
if [ "$RESTORE_FAILURES" -gt 0 ]; then
  echo "══════════════════════════════════════════════════"
  echo "  Restore FAILED: ${RESTORE_FAILURES} step(s)"
  echo "══════════════════════════════════════════════════"
  exit 1
fi
echo "══════════════════════════════════════════════════"
echo "  Restore complete!"
echo "══════════════════════════════════════════════════"
