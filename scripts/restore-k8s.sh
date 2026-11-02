#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Kubernetes)
#  Usage:  bash scripts/restore-k8s.sh [--dry-run] [--components mongodb,mysql,checkpoints,spire]
#          BACKUP_DIR=/backups RESTORE_TIMESTAMP=2025-01-01_120000
#          BACKUP_AGE_IDENTITY=~/backup-key.txt (to read *.age backups)
#
#  Restore MySQL before SPIRE: the SPIRE datastore (bundle, CA journal,
#  entries) is the `spire` database, keys.json only holds the CA private keys.
#  Exits 1 when any step fails.
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RESTORE_TIMESTAMP="${RESTORE_TIMESTAMP:-latest}"
DRY_RUN=false
COMPONENTS="mongodb,mysql,checkpoints,spire"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"
# Writes keys.json into the SPIRE volume while the server is stopped (the
# spire-server image has neither a shell nor tar).
RESTORE_HELPER_IMAGE="${RESTORE_HELPER_IMAGE:-ghcr.io/trading-model/backup-tools:latest}"
RESTORE_FAILURES=0

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
fail() { log "✗ $*"; RESTORE_FAILURES=$((RESTORE_FAILURES + 1)); }
warn() { log "⚠ $*"; }

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

validate_file() {
  local file="$1"
  local label="$2"
  if [ ! -f "$file" ]; then
    fail "${label} not found: ${file}"
    return 1
  fi
  if [ ! -s "$file" ]; then
    fail "${label} is empty: ${file}"
    return 1
  fi
  return 0
}

# Backup of the replica set labelled `$1` in directory `$2`: `<label>.archive.gz`,
# or `<statefulset>-<n>.archive.gz` for backups taken per pod (before 2026-10).
mongo_archive() {
  local label="$1" src="$2" primary="$3" archive
  archive=$(backup_file "${src}/${label}.archive.gz")
  if [ -z "$archive" ]; then
    archive=$(find "$src" -maxdepth 1 \( -name "${primary%-*}-*.archive.gz" -o -name "${primary%-*}-*.archive.gz.age" \) 2>/dev/null | sort | head -1)
  fi
  echo "$archive"
}

restore_mongodb() {
  log "Starting MongoDB restore..."
  local src
  if [ "$RESTORE_TIMESTAMP" != "latest" ]; then
    src="${BACKUP_DIR}/mongodb/${RESTORE_TIMESTAMP}"
  else
    src=$(find "${BACKUP_DIR}/mongodb" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort | tail -1)
  fi

  if [ -z "$src" ] || [ ! -d "$src" ]; then
    fail "No MongoDB backup found in ${BACKUP_DIR}/mongodb"
    return
  fi
  log "Restoring from: ${src}"

  local label primary archive
  for label in mongodb mongodb-audit; do
    if ! primary=$(mongo_primary "$label"); then
      fail "No writable MongoDB primary for ${label}"
      continue
    fi
    archive=$(mongo_archive "$label" "$src" "$primary")
    if [ -z "$archive" ]; then
      fail "No backup for ${label} in ${src}"
      continue
    fi
    if $DRY_RUN; then
      warn "[DRY-RUN] Would restore MongoDB ${label} into ${primary} from ${archive}"
      continue
    fi
    validate_file "$archive" "${label} backup" || continue

    # The dumps carry their oplog (mongodump --oplog): replaying it brings the
    # restore to the point in time the dump ended.
    if open_backup "$archive" | kubectl exec -i -n "${K8S_NAMESPACE}" "${primary}" -- \
      mongorestore --quiet --gzip --archive --drop --oplogReplay; then
      ok "MongoDB restore complete: ${label} (${primary})"
    else
      fail "MongoDB restore failed: ${label} (${primary})"
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
    fail "No MySQL backup found in ${BACKUP_DIR}/mysql"
    return
  fi
  log "Restoring from: ${file}"

  local pod
  if ! pod=$(mysql_primary_pod); then
    fail "No MySQL pod found"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore MySQL into ${pod} from ${file}"
    return
  fi

  validate_file "$file" "MySQL backup" || return

  if open_backup "$file" | gunzip | strip_gtid | mysql_root_sh "${pod}" 'mysql --user=root'; then
    ok "MySQL restore complete (${pod})"
  else
    fail "MySQL restore failed (${pod})"
  fi
}

restore_checkpoints() {
  log "Starting checkpoints restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(latest_backup "${BACKUP_DIR}/checkpoints" "checkpoints_*.tar.gz")
  else
    file=$(backup_file "${BACKUP_DIR}/checkpoints/checkpoints_${RESTORE_TIMESTAMP}.tar.gz")
  fi
  if [ -z "$file" ] || [ ! -f "$file" ]; then
    fail "No checkpoints backup found in ${BACKUP_DIR}/checkpoints"
    return
  fi

  local pod
  pod=$(component_pods trader-trainer | awk '{print $1}')
  if [ -z "$pod" ]; then
    fail "No trader-trainer pod found, restore ${file} manually"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore checkpoints into ${pod} from ${file}"
    return
  fi

  if open_backup "$file" | kubectl exec -i -n "${K8S_NAMESPACE}" "${pod}" -c trader-trainer -- \
    sh -c 'mkdir -p /data/checkpoints && tar xzf - -C /data/checkpoints/'; then
    ok "Checkpoints restore complete (${pod})"
  else
    fail "Checkpoints restore failed (${pod})"
  fi
}

# Stops the SPIRE server, writes keys.json into its volume from a helper pod
# running as the server's user, then starts the server again.
restore_spire() {
  log "Starting SPIRE CA key restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(latest_backup "${BACKUP_DIR}/spire" "keys_*.json")
  else
    file=$(backup_file "${BACKUP_DIR}/spire/keys_${RESTORE_TIMESTAMP}.json")
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    fail "No SPIRE CA key backup found in ${BACKUP_DIR}/spire"
    return
  fi
  log "Restoring from: ${file}"

  local deploy="deployment/spire-server"
  local claim uid gid
  claim=$(kubectl get -n "${K8S_NAMESPACE}" "$deploy" \
    -o jsonpath='{.spec.template.spec.volumes[?(@.name=="spire-data")].persistentVolumeClaim.claimName}' 2>/dev/null || true)
  if [ -z "$claim" ]; then
    fail "SPIRE server has no spire-data volume claim"
    return
  fi
  uid=$(kubectl get -n "${K8S_NAMESPACE}" "$deploy" -o jsonpath='{.spec.template.spec.securityContext.runAsUser}')
  gid=$(kubectl get -n "${K8S_NAMESPACE}" "$deploy" -o jsonpath='{.spec.template.spec.securityContext.runAsGroup}')

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore SPIRE CA key into claim ${claim} from ${file}"
    return
  fi

  validate_file "$file" "SPIRE CA key backup" || return

  local plain
  plain=$(mktemp)
  chmod 600 "$plain"
  if ! open_backup "$file" > "$plain"; then
    rm -f "$plain"
    fail "SPIRE restore failed: cannot read ${file}"
    return
  fi

  log "Stopping the SPIRE server..."
  kubectl scale -n "${K8S_NAMESPACE}" "$deploy" --replicas=0 >/dev/null
  kubectl wait -n "${K8S_NAMESPACE}" --for=delete pod -l app.kubernetes.io/component=spire-server --timeout=120s >/dev/null 2>&1 || true

  kubectl delete pod -n "${K8S_NAMESPACE}" spire-restore --ignore-not-found >/dev/null
  kubectl apply -n "${K8S_NAMESPACE}" -f - >/dev/null <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: spire-restore
  labels:
    app.kubernetes.io/component: spire-restore
spec:
  restartPolicy: Never
  securityContext:
    runAsNonRoot: true
    runAsUser: ${uid:-1000}
    runAsGroup: ${gid:-1000}
    fsGroup: ${gid:-1000}
    seccompProfile:
      type: RuntimeDefault
  containers:
    - name: restore
      image: ${RESTORE_HELPER_IMAGE}
      imagePullPolicy: IfNotPresent
      command: ["sleep", "600"]
      securityContext:
        allowPrivilegeEscalation: false
        capabilities:
          drop: ["ALL"]
      volumeMounts:
        - name: spire-data
          mountPath: /data
  volumes:
    - name: spire-data
      persistentVolumeClaim:
        claimName: ${claim}
EOF
  local written=false
  if kubectl wait -n "${K8S_NAMESPACE}" --for=condition=ready pod/spire-restore --timeout=120s >/dev/null &&
    kubectl exec -i -n "${K8S_NAMESPACE}" spire-restore -- \
      sh -c 'umask 077 && cat > /data/keys.json.restore && mv /data/keys.json.restore /data/keys.json' < "$plain"; then
    written=true
  fi
  rm -f "$plain"
  kubectl delete pod -n "${K8S_NAMESPACE}" spire-restore --wait=true >/dev/null 2>&1 || true

  log "Starting the SPIRE server..."
  kubectl scale -n "${K8S_NAMESPACE}" "$deploy" --replicas=1 >/dev/null
  if ! $written; then
    fail "SPIRE restore failed: keys.json was not written (server restarted with its previous keys)"
    return
  fi
  if kubectl rollout status -n "${K8S_NAMESPACE}" "$deploy" --timeout=180s >/dev/null &&
    kubectl exec -n "${K8S_NAMESPACE}" "$deploy" -c spire-server -- \
      /opt/spire/bin/spire-server healthcheck -socketPath /run/spire/server-sockets/api.sock >/dev/null; then
    ok "SPIRE CA key restore complete"
  else
    fail "SPIRE server is not healthy after the CA key restore"
  fi
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
    checkpoints) restore_checkpoints ;;
    spire)       restore_spire ;;
    # Derived state only (discovery registrations and tokens, DLQ retry queue
    # rebuilt from MongoDB): rebuilt by the services, never restored.
    redis)       warn "Redis is not backed up: its content is rebuilt by the services" ;;
    *)           fail "Unknown component: ${part}" ;;
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
