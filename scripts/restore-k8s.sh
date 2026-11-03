#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Kubernetes)
#  Usage:  bash scripts/restore-k8s.sh [--dry-run] [--components mongodb,mysql,checkpoints,spire]
#          [--timestamp 2025-01-01_120000 | --until 2025-01-01T13:45:00Z]
#          BACKUP_DIR=/backups RESTORE_TIMESTAMP=2025-01-01_120000
#          BACKUP_AGE_IDENTITY=~/backup-key.txt (to read *.age backups)
#
#  --until <instant> (point-in-time recovery, ADR-0031; any date understood
#  by `date -d`, UTC unless it says otherwise): restores the newest daily
#  backup taken before the instant, then replays the archived MySQL binlogs
#  and MongoDB oplogs (backup-incremental-k8s.sh) up to it, excluded. Before
#  touching any data it checks that the archives reach the instant without a
#  gap, and decrypts every one of them: it exits 1 otherwise. Stop the
#  writers first (BACKUP_DR.md): a write landing between the dump restore and
#  the replay makes the replay fail.
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
    --until) RESTORE_UNTIL="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --until: the instant as Unix time, as a backup stamp (to pick the backups
# taken before it) and as mysqlbinlog reads it (UTC).
RESTORE_UNTIL="${RESTORE_UNTIL:-}"
UNTIL_EPOCH=""
UNTIL_STAMP=""
UNTIL_SQL=""
if [ -n "$RESTORE_UNTIL" ]; then
  if [ "$RESTORE_TIMESTAMP" != "latest" ]; then
    echo "--until and --timestamp exclude each other: --until picks the backups itself"
    exit 1
  fi
  if ! UNTIL_EPOCH="$(date -u -d "$RESTORE_UNTIL" +%s 2>/dev/null)"; then
    echo "--until: not a date: ${RESTORE_UNTIL}"
    exit 1
  fi
  if [ "$UNTIL_EPOCH" -gt "$(date -u +%s)" ]; then
    echo "--until: ${RESTORE_UNTIL} is in the future"
    exit 1
  fi
  UNTIL_STAMP="$(date -u -d "@${UNTIL_EPOCH}" +%Y-%m-%d_%H%M%S)"
  UNTIL_SQL="$(date -u -d "@${UNTIL_EPOCH}" '+%Y-%m-%d %H:%M:%S')"
fi

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

# Newest backup of directory `$1` named `<prefix><stamp><suffix>` (with or
# without `.age`) whose stamp is not after `$4`; the newest when `$4` is empty.
backup_until() {
  local dir="$1" prefix="$2" suffix="$3" limit="${4:-}" path stamp best=""
  if [ -z "$limit" ]; then
    latest_backup "$dir" "${prefix}*${suffix}"
    return
  fi
  while read -r path; do
    [ -n "$path" ] || continue
    stamp="${path##*/}"
    stamp="${stamp#"$prefix"}"
    stamp="${stamp%.age}"
    stamp="${stamp%"$suffix"}"
    [[ "$stamp" > "$limit" ]] || best="$path"
  done < <(find "$dir" -maxdepth 1 \( -name "${prefix}*${suffix}" -o -name "${prefix}*${suffix}.age" \) 2>/dev/null | sort)
  echo "$best"
}

# Field `$2` of PITR metadata file `$1` (decrypted).
pitr_value() {
  open_backup "$1" | pitr_field "$2"
}

# Decrypts and decompresses every archive given, output discarded: a damaged
# archive or a wrong key fails here, before any data is touched.
check_archives() {
  local archive
  for archive in "$@"; do
    if ! open_backup "$archive" | gunzip -t 2>/dev/null; then
      echo "archive unreadable (key or content): ${archive}" >&2
      return 1
    fi
  done
}

# Directory of the daily MongoDB backup to restore: RESTORE_TIMESTAMP, the
# newest taken before --until, or the newest.
mongo_backup_dir() {
  local dir best=""
  if [ "$RESTORE_TIMESTAMP" != "latest" ]; then
    echo "${BACKUP_DIR}/mongodb/${RESTORE_TIMESTAMP}"
    return
  fi
  # Stamped directories only: `oplog/` holds the incremental archives.
  while read -r dir; do
    [ -n "$dir" ] || continue
    if [ -n "$UNTIL_STAMP" ] && [[ "${dir##*/}" > "$UNTIL_STAMP" ]]; then
      continue
    fi
    best="$dir"
  done < <(find "${BACKUP_DIR}/mongodb" -mindepth 1 -maxdepth 1 -type d -name '[0-9]*' 2>/dev/null | sort)
  echo "$best"
}

# Replays oplog archives `$2...` into MongoDB primary `$1`, up to --until
# (excluded). mongorestore reads an oplog from a file only: it is written to
# a private directory of the pod and deleted afterwards.
replay_oplog() {
  local primary="$1"
  shift
  local archive
  for archive in "$@"; do
    open_backup "$archive" | gunzip || return 1
  done | kubectl exec -i -n "${K8S_NAMESPACE}" "${primary}" -- sh -c \
    'd=$(mktemp -d) && chmod 700 "$d" && cat > "$d/oplog.bson" && mongorestore --quiet --oplogReplay --oplogLimit "$1:0" "$d"; rc=$?; rm -rf "$d"; exit $rc' \
    sh "$UNTIL_EPOCH"
}

restore_mongodb() {
  log "Starting MongoDB restore..."
  local src
  src=$(mongo_backup_dir)

  if [ -z "$src" ] || [ ! -d "$src" ]; then
    fail "No MongoDB backup found in ${BACKUP_DIR}/mongodb${UNTIL_STAMP:+ before ${UNTIL_STAMP}}"
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

    # --until: the oplog archives must reach the instant from the dump's
    # oplog point, unbroken and readable, before anything is dropped.
    local chain=()
    if [ -n "$UNTIL_EPOCH" ]; then
      local meta start list
      meta=$(backup_file "${src}/${label}.pitr")
      if [ -z "$meta" ]; then
        fail "${label}: the backup in ${src} has no oplog point (taken before ADR-0031): no point-in-time restore from it"
        continue
      fi
      if ! start=$(pitr_value "$meta" oplog_ts) || [ -z "$start" ]; then
        fail "${label}: cannot read the oplog point ${meta} (age key?)"
        continue
      fi
      if ! list=$(oplog_chain "${BACKUP_DIR}/mongodb/oplog/${label}" "$start" "$UNTIL_EPOCH"); then
        fail "${label}: cannot restore up to ${UNTIL_SQL} UTC (reason above)"
        continue
      fi
      mapfile -t chain <<< "$list"
      if ! check_archives "${chain[@]}"; then
        fail "${label}: an oplog archive cannot be read"
        continue
      fi
      log "${label}: ${#chain[@]} oplog archive(s) to replay from ${start}"
    fi

    if $DRY_RUN; then
      warn "[DRY-RUN] Would restore MongoDB ${label} into ${primary} from ${archive}${UNTIL_SQL:+, then its oplog up to ${UNTIL_SQL} UTC}"
      continue
    fi
    validate_file "$archive" "${label} backup" || continue

    # The dumps carry their oplog (mongodump --oplog): replaying it brings the
    # restore to the point in time the dump ended.
    if ! open_backup "$archive" | kubectl exec -i -n "${K8S_NAMESPACE}" "${primary}" -- \
      mongorestore --quiet --gzip --archive --drop --oplogReplay; then
      fail "MongoDB restore failed: ${label} (${primary})"
      continue
    fi
    if [ "${#chain[@]}" -eq 0 ]; then
      ok "MongoDB restore complete: ${label} (${primary})"
      continue
    fi
    # The chain starts before the dump did: replaying an entry the dump
    # already holds is harmless, oplog entries are idempotent.
    if replay_oplog "$primary" "${chain[@]}"; then
      ok "MongoDB restore complete: ${label} (${primary}), up to ${UNTIL_SQL} UTC"
    else
      fail "MongoDB oplog replay failed: ${label} (${primary}); restore again"
    fi
  done
}

# Replays binlog archives `$3...` into MySQL pod `$1`, the first one from
# position `$2`, up to --until (excluded). Through the server like any client
# write, without SQL_LOG_BIN=0: the replayed transactions reach the binlog,
# hence the replicas, with new GTIDs (--skip-gtids: the server may still hold
# the original ones, which would make it skip them).
replay_binlogs() {
  local pod="$1" pos="$2"
  shift 2
  local archive args
  for archive in "$@"; do
    args=(--skip-gtids "--stop-datetime=${UNTIL_SQL}")
    [ -n "$pos" ] && args+=("--start-position=${pos}")
    pos=""
    if ! open_backup "$archive" | gunzip | TZ=UTC mysqlbinlog "${args[@]}" - |
      mysql_root_sh "${pod}" 'mysql --user=root'; then
      echo "binlog replay stopped at ${archive}" >&2
      return 1
    fi
  done
}

restore_mysql() {
  log "Starting MySQL restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(backup_until "${BACKUP_DIR}/mysql" "financial_scraper_" ".sql.gz" "$UNTIL_STAMP")
  else
    file=$(backup_file "${BACKUP_DIR}/mysql/financial_scraper_${RESTORE_TIMESTAMP}.sql.gz")
  fi

  if [ -z "$file" ] || [ ! -f "$file" ]; then
    fail "No MySQL backup found in ${BACKUP_DIR}/mysql${UNTIL_STAMP:+ before ${UNTIL_STAMP}}"
    return
  fi
  log "Restoring from: ${file}"

  local pod
  if ! pod=$(mysql_primary_pod); then
    fail "No MySQL pod found"
    return
  fi

  # --until: the binlog archives of the dumped server must reach the instant
  # from the dump's coordinates, unbroken and readable, before anything is
  # dropped. mysqlbinlog runs here (backup-tools image).
  local chain=() pos=""
  if [ -n "$UNTIL_EPOCH" ]; then
    local meta stamp uuid binlog list
    stamp="${file##*/financial_scraper_}"
    stamp="${stamp%%.*}"
    meta=$(backup_file "${BACKUP_DIR}/mysql/financial_scraper_${stamp}.pitr")
    if [ -z "$meta" ]; then
      fail "MySQL: ${file} has no binlog coordinates (taken before ADR-0031): no point-in-time restore from it"
      return
    fi
    if ! uuid=$(pitr_value "$meta" server_uuid) || ! binlog=$(pitr_value "$meta" binlog_file) ||
      ! pos=$(pitr_value "$meta" binlog_pos) || [ -z "$uuid" ] || [ -z "$binlog" ] || [ -z "$pos" ]; then
      fail "MySQL: cannot read the binlog coordinates ${meta} (age key?)"
      return
    fi
    if ! command -v mysqlbinlog >/dev/null; then
      fail "mysqlbinlog is not installed: run the restore from the backup-tools image"
      return
    fi
    if ! list=$(binlog_chain "${BACKUP_DIR}/mysql/binlog/${uuid}" "$binlog" "$UNTIL_STAMP"); then
      fail "MySQL: cannot restore up to ${UNTIL_SQL} UTC (reason above)"
      return
    fi
    mapfile -t chain <<< "$list"
    if ! check_archives "${chain[@]}"; then
      fail "MySQL: a binlog archive cannot be read"
      return
    fi
    log "MySQL: ${#chain[@]} binlog archive(s) to replay from ${binlog}:${pos}"
  fi

  if $DRY_RUN; then
    warn "[DRY-RUN] Would restore MySQL into ${pod} from ${file}${UNTIL_SQL:+, then its binlogs up to ${UNTIL_SQL} UTC}"
    return
  fi

  validate_file "$file" "MySQL backup" || return

  if ! open_backup "$file" | gunzip | strip_gtid | mysql_root_sh "${pod}" 'mysql --user=root'; then
    fail "MySQL restore failed (${pod})"
    return
  fi
  if [ "${#chain[@]}" -eq 0 ]; then
    ok "MySQL restore complete (${pod})"
  elif replay_binlogs "$pod" "$pos" "${chain[@]}"; then
    ok "MySQL restore complete (${pod}), up to ${UNTIL_SQL} UTC"
  else
    fail "MySQL binlog replay failed (${pod}): the data stopped between the dump and ${UNTIL_SQL} UTC, restore again"
  fi
}

restore_checkpoints() {
  log "Starting checkpoints restore..."
  local file
  if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
    file=$(backup_until "${BACKUP_DIR}/checkpoints" "checkpoints_" ".tar.gz" "$UNTIL_STAMP")
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
    file=$(backup_until "${BACKUP_DIR}/spire" "keys_" ".json" "$UNTIL_STAMP")
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
[ -n "$RESTORE_UNTIL" ] && echo "  Until: ${UNTIL_SQL} UTC (point-in-time, excluded)"
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
