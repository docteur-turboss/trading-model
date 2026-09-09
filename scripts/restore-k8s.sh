#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Kubernetes)
#  Usage:  bash scripts/restore-k8s.sh [--dry-run] [--components mongodb,mysql,redis]
#          BACKUP_DIR=/backups RESTORE_TIMESTAMP=2025-01-01_120000
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RESTORE_TIMESTAMP="${RESTORE_TIMESTAMP:-latest}"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,checkpoints"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"

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

kubectl_exec() {
  kubectl exec -n "${K8S_NAMESPACE}" "$@" 2>/dev/null
}

resolve_latest() {
  local dir="$1"
  local pattern="$2"
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    local latest
    latest=$(find "${BACKUP_DIR}/${dir}" -name "${pattern}" 2>/dev/null | sort | tail -1)
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
  local src="${BACKUP_DIR}/mongodb"
  if [ "$RESTORE_TIMESTAMP" != "latest" ]; then
    src="${BACKUP_DIR}/mongodb/${RESTORE_TIMESTAMP}"
  else
    src=$(find "${BACKUP_DIR}/mongodb" -maxdepth 1 -type d 2>/dev/null | sort | tail -1)
  fi

  if [ -z "$src" ] || [ ! -d "$src" ]; then
    warn "No MongoDB backup found, skipping"
    return
  fi
  log "Restoring from: ${src}"

  for pod in $(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=mongodb -o jsonpath='{.items[*].metadata.name}' 2>/dev/null); do
    local archive="${src}/${pod}.archive.gz"
    if [ ! -f "$archive" ]; then
      warn "No backup for ${pod}, skipping"
      continue
    fi

    if $DRY_RUN; then
      warn "[DRY-RUN] Would restore MongoDB: ${pod} from ${archive}"
      continue
    fi

    validate_file "$archive" "${pod} backup" || continue

    cat "$archive" | kubectl_exec "${pod}" -- mongorestore --gzip --drop --archive 2>/dev/null
    if [ $? -eq 0 ]; then
      ok "MongoDB restore complete: ${pod}"
    else
      fail "MongoDB restore failed: ${pod}"
    fi
  done
}

restore_mysql() {
  log "Starting MySQL restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${BACKUP_DIR}/mysql" -name "financial_scraper_*.sql.gz" 2>/dev/null | sort | tail -1)
  else
    file="${BACKUP_DIR}/mysql/financial_scraper_${RESTORE_TIMESTAMP}.sql.gz"
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No MySQL backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  local pod
  pod=$(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=mysql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -z "$pod" ]; then
    warn "No MySQL pod found, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore MySQL from ${file}"
    return
  fi

  validate_file "$file" "MySQL backup" || return

  gunzip < "$file" | kubectl_exec "${pod}" -- mysql --user=root 2>/dev/null
  if [ $? -eq 0 ]; then
    ok "MySQL restore complete"
  else
    fail "MySQL restore failed"
  fi
}

restore_redis() {
  log "Starting Redis restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${BACKUP_DIR}/redis" -name "*.rdb" 2>/dev/null | sort | tail -1)
  else
    file=$(find "${BACKUP_DIR}/redis" -name "*_${RESTORE_TIMESTAMP}.rdb" 2>/dev/null | head -1)
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No Redis backup found, skipping"
    return
  fi
  log "Restoring from: ${file}"

  local pod
  pod=$(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=redis-primary -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -z "$pod" ]; then
    warn "No Redis primary pod found, skipping"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore Redis from ${file}"
    return
  fi

  kubectl cp "$file" "${K8S_NAMESPACE}/${pod}:/tmp/dump.rdb" 2>/dev/null
  kubectl_exec "${pod}" -- sh -c "cp /tmp/dump.rdb /data/dump.rdb && rm /tmp/dump.rdb" 2>/dev/null
  log "Restarting Redis pod to reload dump.rdb..."
  kubectl delete pod -n "${K8S_NAMESPACE}" "${pod}" 2>/dev/null

  log "Waiting for Redis pod to restart..."
  kubectl wait --for=condition=ready pod -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=redis-primary --timeout=60s 2>/dev/null || true
  ok "Redis restore triggered — pod replacing with restored data"
}

restore_checkpoints() {
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(find "${BACKUP_DIR}/checkpoints" -name "checkpoints_*.tar.gz" 2>/dev/null | sort | tail -1)
  else
    file="${BACKUP_DIR}/checkpoints/checkpoints_${RESTORE_TIMESTAMP}.tar.gz"
  fi
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    warn "No checkpoints backup found, skipping"
    return
  fi

  local pod
  pod=$(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=trader-trainer -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -z "$pod" ]; then
    warn "No trader-trainer pod found, copying file for manual restore: ${file}"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore checkpoints from ${file}"
    return
  fi

  kubectl_exec "${pod}" -- mkdir -p /data/checkpoints 2>/dev/null
  cat "$file" | kubectl_exec "${pod}" -- tar xzf - -C /data/checkpoints/ 2>/dev/null
  ok "Checkpoints restore complete"
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Restore (K8s)"
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
