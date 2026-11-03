#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Kubernetes)
#  Usage:  bash scripts/restore-k8s.sh [--dry-run] [--components mongodb,mysql,checkpoints,spire]
#          BACKUP_DIR=/backups RESTORE_TIMESTAMP=2025-01-01_120000
#          BACKUP_AGE_IDENTITY=~/backup-key.txt (to read *.age backups)
#
#  Without --timestamp, each component comes from the newest run whose
#  manifest lists it; every file is checked against its manifest (size,
#  sha256 of the plaintext; MySQL: ends with `-- Dump completed`) before
#  anything is written, --dry-run included. Runs taken before manifests are
#  only restored with an explicit --timestamp (see backup-lib.sh).
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

# Backup of the replica set labelled `$1` in the run directory `$2` taken
# before manifests: `<label>.archive.gz`, or `<statefulset>-<n>.archive.gz`
# for backups taken per pod (before 2026-10).
legacy_mongo_archive() {
  local label="$1" src="$2" primary="$3" archive
  archive=$(backup_file "${src}/${label}.archive.gz")
  if [ -z "$archive" ] && [ -n "$primary" ]; then
    archive=$(find "$src" -maxdepth 1 \( -name "${primary%-*}-*.archive.gz" -o -name "${primary%-*}-*.archive.gz.age" \) 2>/dev/null | sort | head -1)
  fi
  echo "$archive"
}

restore_mongodb() {
  log "Starting MongoDB restore..."
  local label primary legacy=""
  for label in mongodb mongodb-audit; do
    primary=$(mongo_primary "$label") || primary=""
    [ "$RESTORE_TIMESTAMP" = "latest" ] ||
      legacy=$(legacy_mongo_archive "$label" "${BACKUP_DIR}/mongodb/${RESTORE_TIMESTAMP}" "$primary")
    resolve_and_verify "$label" "$legacy" || continue
    if [ -z "$primary" ]; then
      fail "No writable MongoDB primary for ${label}"
      continue
    fi
    if $DRY_RUN; then
      warn "[DRY-RUN] Would restore MongoDB ${label} into ${primary} from ${RESOLVED_FILE}"
      continue
    fi

    # The dumps carry their oplog (mongodump --oplog): replaying it brings the
    # restore to the point in time the dump ended.
    if open_backup "$RESOLVED_FILE" | kubectl exec -i -n "${K8S_NAMESPACE}" "${primary}" -- \
      mongorestore --quiet --gzip --archive --drop --oplogReplay; then
      ok "MongoDB restore complete: ${label} (${primary})"
    else
      fail "MongoDB restore failed: ${label} (${primary})"
    fi
  done
}

restore_mysql() {
  log "Starting MySQL restore..."
  resolve_and_verify mysql "$(backup_file "${BACKUP_DIR}/mysql/financial_scraper_${RESTORE_TIMESTAMP}.sql.gz")" || return 0
  local file="$RESOLVED_FILE"
  verify_mysql_dump_complete "$file" || return 0

  local pod
  if ! pod=$(mysql_primary_pod); then
    fail "No MySQL pod found"
    return
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore MySQL into ${pod} from ${file}"
    return
  fi

  if open_backup "$file" | gunzip | strip_gtid | mysql_root_sh "${pod}" 'mysql --user=root'; then
    ok "MySQL restore complete (${pod})"
  else
    fail "MySQL restore failed (${pod})"
  fi
}

restore_checkpoints() {
  log "Starting checkpoints restore..."
  resolve_and_verify checkpoints "$(backup_file "${BACKUP_DIR}/checkpoints/checkpoints_${RESTORE_TIMESTAMP}.tar.gz")" || return 0
  local file="$RESOLVED_FILE"

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
  resolve_and_verify spire "$(backup_file "${BACKUP_DIR}/spire/keys_${RESTORE_TIMESTAMP}.json")" || return 0
  local file="$RESOLVED_FILE"

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
