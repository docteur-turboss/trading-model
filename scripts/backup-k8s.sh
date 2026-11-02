#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Backup Script (Kubernetes)
#  Usage:  bash scripts/backup-k8s.sh [--dry-run] [--components mongodb,mysql,checkpoints,spire]
#          BACKUP_DIR=/backups BACKUP_S3_BUCKET=s3://my-bucket/backups
#          BACKUP_AGE_RECIPIENTS=age1... (encryption, see backup-lib.sh)
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
DRY_RUN=false
COMPONENTS="mongodb,mysql,checkpoints,spire"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"
METRICS_FILE="${METRICS_FILE:-}"

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

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

backup_mongodb() {
  log "Starting MongoDB backup..."
  local dest="${BACKUP_DIR}/mongodb/${TIMESTAMP}"
  mkdir -p "$dest"

  # One dump per replica set, from its primary: every member holds the same data.
  local label primary
  for label in mongodb mongodb-audit; do
    if ! primary=$(mongo_primary "$label"); then
      fail "No writable MongoDB primary for ${label}"
      write_metric "$label" 0
      continue
    fi
    if $DRY_RUN; then
      warn "[DRY-RUN] Would backup MongoDB ${label} from ${primary}"
      continue
    fi
    local file="${dest}/${label}.archive.gz${AGE_SUFFIX}"
    if kubectl_exec "${primary}" -- mongodump --gzip --archive --oplog | seal > "$file"; then
      ok "MongoDB backup complete: ${label} (${primary})"
      record_output "$file"
      write_metric "$label" 1
    else
      fail "MongoDB backup failed: ${label} (${primary})"
      write_metric "$label" 0
    fi
  done
}

backup_mysql() {
  log "Starting MySQL backup..."
  local dest="${BACKUP_DIR}/mysql"
  mkdir -p "$dest"
  local file="${dest}/financial_scraper_${TIMESTAMP}.sql.gz${AGE_SUFFIX}"

  local pod
  if ! pod=$(mysql_primary_pod); then
    fail "No MySQL pod found"
    write_metric "mysql" 0
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup MySQL from ${pod}"
    return
  fi

  if mysql_root_sh "${pod}" "$MYSQL_DUMP_SH" 2>/dev/null | gzip | seal > "$file" && [ -s "$file" ]; then
    ok "MySQL backup complete: ${file}"
    record_output "$file"
    write_metric "mysql" 1
  else
    fail "MySQL backup failed"
    write_metric "mysql" 0
  fi
}

backup_checkpoints() {
  log "Starting trader-trainer checkpoints backup..."
  local dest="${BACKUP_DIR}/checkpoints"
  mkdir -p "$dest"

  local pod
  pod=$(component_pods trader-trainer | awk '{print $1}')
  if [ -z "$pod" ]; then
    fail "No trader-trainer pod found"
    write_metric "checkpoints" 0
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup checkpoints from ${pod}"
    return
  fi

  local file="${dest}/checkpoints_${TIMESTAMP}.tar.gz${AGE_SUFFIX}"
  if kubectl_exec "${pod}" -c trader-trainer -- tar czf - -C /data/checkpoints . | seal > "$file"; then
    ok "Checkpoints backup complete"
    record_output "$file"
    write_metric "checkpoints" 1
  else
    fail "Checkpoints backup failed"
    write_metric "checkpoints" 0
  fi
}

backup_spire() {
  log "Starting SPIRE CA key backup..."
  local dest="${BACKUP_DIR}/spire"
  mkdir -p "$dest"

  local pod
  pod=$(component_pods spire-server | awk '{print $1}')
  if [ -z "$pod" ]; then
    fail "No SPIRE server pod found"
    write_metric "spire" 0
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would backup SPIRE CA key from ${pod}"
    return
  fi

  local file="${dest}/keys_${TIMESTAMP}.json${AGE_SUFFIX}"
  # The official spire-server image has no shell: read the key through the
  # spire-entries sidecar (alpine), which mounts the data volume read-only.
  if kubectl_exec -c spire-entries "${pod}" -- cat /run/spire/data/keys.json | seal > "$file"; then
    ok "SPIRE CA key backup complete: ${file}"
    record_output "$file"
    write_metric "spire" 1
  else
    fail "SPIRE CA key backup failed"
    write_metric "spire" 0
  fi
}

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Backup (K8s)"
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
    mongodb)      backup_mongodb ;;
    mysql)        backup_mysql ;;
    # Derived state only (discovery registrations and tokens, DLQ retry queue
    # rebuilt from MongoDB): rebuilt by the services, never restored.
    redis)        warn "Redis is not backed up: its content is rebuilt by the services" ;;
    checkpoints)  backup_checkpoints ;;
    spire)        backup_spire ;;
    *)            fail "Unknown component: ${part}"; write_metric "$part" 0 ;;
  esac
done

prune_old
upload_offsite
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
