#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Backup Script (Kubernetes)
#  Usage:  bash scripts/backup-k8s.sh [--dry-run] [--components mongodb,mysql,redis]
#          BACKUP_DIR=/backups BACKUP_S3_BUCKET=s3://my-bucket/backups
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
COMPONENTS="mongodb,mysql,redis,ca-keys,checkpoints"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
S3_BUCKET="${BACKUP_S3_BUCKET:-}"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"

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

kubectl_exec() {
  kubectl exec -n "${K8S_NAMESPACE}" "$@" 2>/dev/null
}

backup_mongodb() {
  log "Starting MongoDB backup..."
  local dest="${BACKUP_DIR}/mongodb/${TIMESTAMP}"
  mkdir -p "$dest"

  for label in "app.kubernetes.io/component=mongodb"; do
    local pods
    pods=$(kubectl get pods -n "${K8S_NAMESPACE}" -l "${label}" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
    if [ -z "$pods" ]; then
      warn "No MongoDB pods found, skipping"
      continue
    fi
    for pod in $pods; do
      if $DRY_RUN; then
        warn "[DRY-RUN] Would backup MongoDB: ${pod}"
        continue
      fi
      local file="${dest}/${pod}.archive.gz"
      if kubectl_exec "${pod}" -- mongodump --gzip --oplog --archive > "$file" 2>/dev/null; then
        ok "MongoDB backup complete: ${pod}"
      else
        fail "MongoDB backup failed: ${pod}"
      fi
    done
  done
}

backup_mysql() {
  log "Starting MySQL backup..."
  local dest="${BACKUP_DIR}/mysql"
  mkdir -p "$dest"
  local file="${dest}/financial_scraper_${TIMESTAMP}.sql.gz"

  local pod
  pod=$(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=mysql -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -z "$pod" ]; then
    warn "No MySQL pod found, skipping"
    return
  fi

  local password
  password=$(kubectl get secret -n "${K8S_NAMESPACE}" trading-model-secrets -o jsonpath='{.data.MYSQL_ROOT_PASSWORD}' 2>/dev/null | base64 -d 2>/dev/null || echo "")

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup MySQL from ${pod}"
    return
  fi

  if [ -n "$password" ]; then
    kubectl_exec "${pod}" -- mysqldump --user=root --password="${password}" --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | gzip > "$file"
  else
    kubectl_exec "${pod}" -- mysqldump --user=root --all-databases --single-transaction --quick --lock-tables=false 2>/dev/null | gzip > "$file"
  fi

  if [ $? -eq 0 ] && [ -s "$file" ]; then
    ok "MySQL backup complete: ${file}"
  else
    fail "MySQL backup failed"
  fi
}

backup_redis() {
  log "Starting Redis backup..."
  local dest="${BACKUP_DIR}/redis"
  mkdir -p "$dest"

  for label in "app.kubernetes.io/component=redis-primary"; do
    local pods
    pods=$(kubectl get pods -n "${K8S_NAMESPACE}" -l "${label}" -o jsonpath='{.items[*].metadata.name}' 2>/dev/null)
    if [ -z "$pods" ]; then
      warn "No Redis primary pod found, skipping"
      continue
    fi
    for pod in $pods; do
      if $DRY_RUN; then
        warn "[DRY-RUN] Would backup Redis: ${pod}"
        continue
      fi
      if kubectl_exec "${pod}" -- redis-cli BGSAVE 2>/dev/null; then
        sleep 2
        local file="${dest}/${pod}_${TIMESTAMP}.rdb"
        kubectl cp "${K8S_NAMESPACE}/${pod}:/data/dump.rdb" "$file" 2>/dev/null
        ok "Redis backup complete: ${pod}"
      else
        fail "Redis backup failed: ${pod}"
      fi
    done
  done
}

backup_ca_keys() {
  log "Starting CA keys backup..."
  local dest="${BACKUP_DIR}/ca-keys"
  mkdir -p "$dest"

  local pod
  pod=$(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=certificate-authority -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -z "$pod" ]; then
    warn "No CA pod found, skipping CA keys backup"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup CA keys from ${pod}"
    return
  fi

  local file="${dest}/ca-keys_${TIMESTAMP}.tar.gz"
  if kubectl_exec "${pod}" -- tar czf - -C /etc/ca-keys . 2>/dev/null > "$file"; then
    ok "CA keys backup complete"
  else
    fail "CA keys backup failed"
  fi
}

backup_checkpoints() {
  log "Starting trader-trainer checkpoints backup..."
  local dest="${BACKUP_DIR}/checkpoints"
  mkdir -p "$dest"

  local pod
  pod=$(kubectl get pods -n "${K8S_NAMESPACE}" -l app.kubernetes.io/component=trader-trainer -o jsonpath='{.items[0].metadata.name}' 2>/dev/null)
  if [ -z "$pod" ]; then
    warn "No trader-trainer pod found, skipping checkpoints backup"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup checkpoints from ${pod}"
    return
  fi

  local file="${dest}/checkpoints_${TIMESTAMP}.tar.gz"
  if kubectl_exec "${pod}" -- tar czf - -C /data/checkpoints . 2>/dev/null > "$file"; then
    ok "Checkpoints backup complete"
  else
    fail "Checkpoints backup failed"
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

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Backup (K8s)"
echo "  Timestamp: ${TIMESTAMP}"
echo "  Backup Dir: ${BACKUP_DIR}"
echo "  Components: ${COMPONENTS}"
echo "══════════════════════════════════════════════════"
echo ""

IFS=',' read -ra PARTS <<< "$COMPONENTS"
for part in "${PARTS[@]}"; do
  case "$part" in
    mongodb)      backup_mongodb ;;
    mysql)        backup_mysql ;;
    redis)        backup_redis ;;
    ca-keys)      backup_ca_keys ;;
    checkpoints)  backup_checkpoints ;;
    *)            warn "Unknown component: ${part}" ;;
  esac
done

prune_old
upload_to_s3

echo ""
echo "══════════════════════════════════════════════════"
echo "  Backup complete!"
echo "  Location: ${BACKUP_DIR}"
echo "══════════════════════════════════════════════════"
