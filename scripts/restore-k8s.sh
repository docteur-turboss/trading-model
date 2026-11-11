#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Database Restore Script (Kubernetes)
#  Usage:  bash scripts/restore-k8s.sh [--dry-run] [--components mongodb,mongodb-audit,mysql,checkpoints,spire]
#          [--timestamp 2025-01-01_120000 | --until 2025-01-01T13:45:00Z]
#          [--no-retention]
#          [--allow-mixed-runs] [--ns <db.coll|db.*>]... [--into-scratch]
#          BACKUP_DIR=/backups RESTORE_TIMESTAMP=2025-01-01_120000
#          BACKUP_AGE_IDENTITY=~/backup-key.txt (to read *.age backups)
#
#  --until <instant> (point-in-time recovery, ADR-0031; any date understood
#  by `date -d`, UTC unless it says otherwise): restores, for each component,
#  the newest run taken before the instant whose manifest lists it, then replays the archived MySQL binlogs
#  and MongoDB oplogs (backup-incremental-k8s.sh) up to it, excluded. Before
#  touching any data it checks that the archives reach the instant without a
#  gap, and decrypts every one of them: it exits 1 otherwise.
#  Every component is checked before the first one is written (a dry run
#  first): a refusal leaves every database as it was. Stop the
#  writers first (BACKUP_DR.md): a write landing between the dump restore and
#  the replay makes the replay fail.
#
#  Without --timestamp, ONE run is picked for all the components asked: the
#  newest whose manifest lists every one of them (issue #330; the timestamp is
#  printed). None: exit 1. --allow-mixed-runs restores the old rule, each
#  component from the newest run whose manifest lists it, with a warning per
#  component (MySQL and MongoDB may then be out of step with each other).
#  Every file is checked against its manifest (size,
#  sha256 of the plaintext; MySQL: ends with `-- Dump completed`) before
#  anything is written, --dry-run included. Runs taken before manifests are
#  only restored with an explicit --timestamp (see backup-lib.sh).
#
#  Component `mongodb` restores both replica sets (operational, then audit);
#  `mongodb-audit` the audit trail alone, e.g. from a weekly or monthly
#  off-site tier, which holds no operational dump (ADR-0032).
#
#  --ns <pattern> (repeatable, issue #335; --components mongodb or
#  mongodb-audit only): restores only the matching namespaces of each replica
#  set (mongorestore --nsInclude); --drop then only drops the collections
#  restored, everything else stays as it is. --oplogReplay is NOT passed then:
#  mongorestore refuses it with --nsInclude, so the restore stops at the
#  instant the dump started, not at the end of its oplog. --until excludes
#  --ns (the oplog replay is whole-replica-set).
#  --into-scratch: restores into `restore_<timestamp>_<db>` (printed) instead
#  of the original databases, which are not touched (--nsFrom/--nsTo); without
#  --ns it restores every namespace. Never restore `audit.*` in place with
#  --ns (the hash chain, ADR-0027): refused; use --into-scratch.
#  Without either option the mongorestore arguments are unchanged.
#
#  SPIRE (ADR-0065): its SQLite datastore and CA keys are one file of the run
#  (spire/data_<TS>.tar), independent of MySQL. Runs taken before ADR-0065
#  (spire/keys_<TS>.json, datastore in MySQL) are refused for SPIRE.
#  Exits 1 when any step fails.
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
RESTORE_TIMESTAMP="${RESTORE_TIMESTAMP:-latest}"
DRY_RUN=false
COMPONENTS="mongodb,mysql,checkpoints,spire"
K8S_NAMESPACE="${K8S_NAMESPACE:-trading-model}"
# Writes the SPIRE datastore and CA keys into the server volume while the
# server is stopped (the spire-server image has neither a shell nor tar).
# Explicit override wins; otherwise the image of the db-backup CronJob (the
# digest deploy.yml applied), see resolve_helper_image (issue #323).
RESTORE_HELPER_IMAGE="${RESTORE_HELPER_IMAGE:-}"
FALLBACK_HELPER_IMAGE="ghcr.io/trading-model/backup-tools:latest"
RESTORE_FAILURES=0
# true: each component from its own newest run (see the header).
ALLOW_MIXED_RUNS="${ALLOW_MIXED_RUNS:-false}"
# true once every component passed the checks (end of the script).
CHECKED=false
# --ns patterns and --into-scratch (issue #335).
NS_INCLUDE=()
INTO_SCRATCH=false
# false (--no-retention): keep the rows past their retention (forensics).
RUN_RETENTION=true
# Upper bound for the purge Job (the CronJob allows 4 h: activeDeadlineSeconds).
RETENTION_WAIT="${RETENTION_WAIT:-4h}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run) DRY_RUN=true; shift ;;
    --components) COMPONENTS="$2"; shift 2 ;;
    --timestamp) RESTORE_TIMESTAMP="$2"; shift 2 ;;
    --until) RESTORE_UNTIL="$2"; shift 2 ;;
    --allow-mixed-runs) ALLOW_MIXED_RUNS=true; shift ;;
    --ns) [ $# -ge 2 ] || { echo "--ns needs a pattern"; exit 1; }; NS_INCLUDE+=("$2"); shift 2 ;;
    --into-scratch) INTO_SCRATCH=true; shift ;;
    --no-retention) RUN_RETENTION=false; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# --ns / --into-scratch only make sense for the MongoDB components, and not
# with a replay of the whole oplog.
if [ "${#NS_INCLUDE[@]}" -gt 0 ] || $INTO_SCRATCH; then
  IFS=',' read -ra _NS_COMPONENTS <<< "$COMPONENTS"
  for _c in "${_NS_COMPONENTS[@]}"; do
    case "$_c" in
      mongodb|mongodb-audit) ;;
      *) echo "--ns / --into-scratch only apply to --components mongodb (or mongodb-audit), not ${_c}"; exit 1 ;;
    esac
  done
  if [ -n "${RESTORE_UNTIL:-}" ]; then
    echo "--ns / --into-scratch cannot be combined with --until: mongorestore refuses --oplogReplay with --nsInclude"
    exit 1
  fi
  for _p in "${NS_INCLUDE[@]}"; do
    if ! [[ "$_p" =~ ^[A-Za-z0-9_*-]+\.[A-Za-z0-9_.*-]+$ ]]; then
      echo "--ns: expected <db>.<collection> or <db>.*, got: ${_p}"
      exit 1
    fi
    # The database part is a glob for mongorestore: refuse every pattern that
    # can match `audit` (audit.x, a*.x, *dit.*, *.x...).
    _db_part="${_p%%.*}"
    # shellcheck disable=SC2053
    if ! $INTO_SCRATCH && [[ audit == $_db_part ]]; then
      echo "--ns ${_p}: restoring the audit trail partially in place can break its hash chain (ADR-0027): add --into-scratch"
      exit 1
    fi
  done
fi

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
  # resolve_backup (backup-lib.sh) skips the runs taken after the instant.
  RESTORE_NOT_AFTER="$UNTIL_STAMP"
fi

fail() { log "✗ $*"; RESTORE_FAILURES=$((RESTORE_FAILURES + 1)); }

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

# Field `$2` of PITR metadata file `$1` (decrypted).
pitr_value() {
  open_backup "$1" | pitr_field "$2"
}

# Decrypts and decompresses every archive given, output discarded: a damaged
# archive or a wrong key fails here, before any data is touched.
check_archives() {
  # Already done by the check pass that precedes any write.
  $CHECKED && return 0
  local archive
  for archive in "$@"; do
    if ! open_backup "$archive" | gunzip -t 2>/dev/null; then
      echo "archive unreadable (key or content): ${archive}" >&2
      return 1
    fi
  done
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

# restore_mongodb <replica set label>...
restore_mongodb() {
  log "Starting MongoDB restore ($*)..."
  local label primary legacy=""
  for label in "$@"; do
    primary=$(mongo_primary "$label") || primary=""
    [ "$RESTORE_TIMESTAMP" = "latest" ] ||
      legacy=$(legacy_mongo_archive "$label" "${BACKUP_DIR}/mongodb/${RESTORE_TIMESTAMP}" "$primary")
    resolve_and_verify "$label" "$legacy" || continue
    if [ -z "$primary" ]; then
      fail "No writable MongoDB primary for ${label}"
      continue
    fi

    # --until: the oplog archives must reach the instant from the dump's
    # oplog point, unbroken and readable, before anything is dropped.
    local chain=()
    if [ -n "$UNTIL_EPOCH" ]; then
      local src meta start list
      src=$(dirname "$RESOLVED_FILE")
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
      warn "[DRY-RUN] Would restore MongoDB ${label} into ${primary} from ${RESOLVED_FILE}${UNTIL_SQL:+, then its oplog up to ${UNTIL_SQL} UTC}"
      continue
    fi

    # The dumps carry their oplog (mongodump --oplog): replaying it brings the
    # restore to the point in time the dump ended.
    local mr_args=(--quiet --gzip --archive --drop)
    if [ "${#NS_INCLUDE[@]}" -gt 0 ] || $INTO_SCRATCH; then
      # No --oplogReplay: refused by mongorestore with --nsInclude.
      local p
      if [ "${#NS_INCLUDE[@]}" -gt 0 ]; then
        for p in "${NS_INCLUDE[@]}"; do mr_args+=(--nsInclude "$p"); done
      else
        mr_args+=(--nsInclude '*')
      fi
      if $INTO_SCRATCH; then
        # Name from the run actually restored (its directory is the stamp),
        # never from "latest"; run time if the layout has no stamp.
        local scratch_ts
        scratch_ts=$(basename "$(dirname "$RESOLVED_FILE")")
        [[ "$scratch_ts" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$ ]] || scratch_ts=$(date -u +%Y-%m-%d_%H%M%S)
        # admin.system.* cannot be created under another name (InvalidNamespace,
        # verified on the compose image): never restored into a scratch copy.
        mr_args+=(--nsExclude 'admin.*')
        mr_args+=(--nsFrom '$db$.$coll$' --nsTo "restore_${scratch_ts}_\$db\$.\$coll\$")
        log "${label}: restoring into scratch databases restore_${scratch_ts}_<db> (one per restored database)"
      fi
    else
      mr_args+=(--oplogReplay)
    fi
    if ! open_backup "$RESOLVED_FILE" | kubectl exec -i -n "${K8S_NAMESPACE}" "${primary}" -- \
      mongorestore "${mr_args[@]}"; then
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

# Data policy: a restore must not bring back rows past their retention. Runs
# the db-retention CronJob once (same user, secrets and metrics), waits for it.
purge_expired_rows() {
  if ! $RUN_RETENTION; then
    warn "--no-retention: rows past their retention stay until the next db-retention run"
    return
  fi
  local job
  job="db-retention-post-restore-$(date -u +%Y%m%d%H%M%S)"
  log "Purging rows past their retention (Job ${job})..."
  # The Job has backoffLimit 0: a failed purge must end the wait at once, not after RETENTION_WAIT.
  local wc wf
  if kubectl create job -n "${K8S_NAMESPACE}" "$job" --from=cronjob/db-retention >/dev/null &&
    {
      kubectl wait -n "${K8S_NAMESPACE}" --for=condition=complete "job/${job}" --timeout="${RETENTION_WAIT}" >/dev/null 2>&1 &
      wc=$!
      kubectl wait -n "${K8S_NAMESPACE}" --for=condition=failed "job/${job}" --timeout="${RETENTION_WAIT}" >/dev/null 2>&1 &
      wf=$!
      wait -n "$wc" "$wf"
      kill "$wc" "$wf" 2>/dev/null
      [ "$(kubectl get -n "${K8S_NAMESPACE}" "job/${job}" -o jsonpath='{.status.succeeded}')" = "1" ]
    }; then
    ok "Retention purge complete (${job})"
  else
    kubectl logs -n "${K8S_NAMESPACE}" "job/${job}" --tail=20 2>&1 || true
    fail "Retention purge failed (${job}): expired rows may be back, run it again"
  fi
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
    if ! [[ "$binlog" =~ ^[A-Za-z0-9_.-]+[.][0-9]+$ ]] || ! [[ "$pos" =~ ^[0-9]+$ ]]; then
      fail "MySQL: malformed binlog coordinates in ${meta}: no point-in-time restore from it"
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

  if ! open_backup "$file" | gunzip | strip_gtid | mysql_root_sh "${pod}" 'mysql --user=root'; then
    fail "MySQL restore failed (${pod})"
    return
  fi
  if [ "${#chain[@]}" -eq 0 ]; then
    ok "MySQL restore complete (${pod})"
    purge_expired_rows
  elif replay_binlogs "$pod" "$pos" "${chain[@]}"; then
    ok "MySQL restore complete (${pod}), up to ${UNTIL_SQL} UTC"
    purge_expired_rows
  else
    fail "MySQL binlog replay failed (${pod}): the data stopped between the dump and ${UNTIL_SQL} UTC, restore again"
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

# Stops the SPIRE server, writes the datastore and CA keys of the run
# (data_<TS>.tar) into its volume from a helper pod running as the server's
# user, then starts the server again. The WAL files of the replaced datastore
# are removed: replayed onto the restored file they would corrupt it.
restore_spire() {
  log "Starting SPIRE server restore..."
  resolve_and_verify spire "$(backup_file "${BACKUP_DIR}/spire/data_${RESTORE_TIMESTAMP}.tar")" || return 0
  local file="$RESOLVED_FILE"
  case "$file" in
    */keys_*)
      fail "SPIRE: ${file} was taken before ADR-0065 (datastore in MySQL): its CA keys do not match the SQLite datastore; restore a newer run, or let the server start a new CA (agents bootstrap again)"
      return
      ;;
  esac

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
    warn "[DRY-RUN] Would restore the SPIRE datastore and CA keys into claim ${claim} from ${file}"
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
      sh -c 'set -e; umask 077; rm -rf /data/restore.tmp; mkdir /data/restore.tmp
        tar -xf - -C /data/restore.tmp datastore.sqlite3 keys-sqlite.json
        rm -f /data/datastore.sqlite3-wal /data/datastore.sqlite3-shm
        mv /data/restore.tmp/datastore.sqlite3 /data/datastore.sqlite3
        mv /data/restore.tmp/keys-sqlite.json /data/keys-sqlite.json
        rmdir /data/restore.tmp' < "$plain"; then
    written=true
  fi
  rm -f "$plain"
  kubectl delete pod -n "${K8S_NAMESPACE}" spire-restore --wait=true >/dev/null 2>&1 || true

  log "Starting the SPIRE server..."
  kubectl scale -n "${K8S_NAMESPACE}" "$deploy" --replicas=1 >/dev/null
  if ! $written; then
    fail "SPIRE restore failed: the datastore and CA keys were not written (server restarted with its previous state)"
    return
  fi
  if kubectl rollout status -n "${K8S_NAMESPACE}" "$deploy" --timeout=180s >/dev/null &&
    kubectl exec -n "${K8S_NAMESPACE}" "$deploy" -c spire-server -- \
      /opt/spire/bin/spire-server healthcheck -socketPath /run/spire/server-sockets/api.sock >/dev/null; then
    ok "SPIRE server restore complete"
  else
    fail "SPIRE server is not healthy after the restore"
  fi
}

# Sets RESTORE_HELPER_IMAGE when no override: the image of the `backup`
# container of the db-backup CronJob; falls back to the mobile `latest` tag
# with a warning when the CronJob cannot be read (new cluster, missing RBAC).
resolve_helper_image() {
  [ -z "$RESTORE_HELPER_IMAGE" ] || return 0
  local img
  img="$(kubectl get cronjob db-backup -n "${K8S_NAMESPACE}"     -o jsonpath='{.spec.jobTemplate.spec.template.spec.containers[?(@.name=="backup")].image}' 2>/dev/null)" || img=""
  if [ -n "$img" ]; then
    RESTORE_HELPER_IMAGE="$img"
  else
    RESTORE_HELPER_IMAGE="$FALLBACK_HELPER_IMAGE"
    warn "CronJob db-backup not readable in ${K8S_NAMESPACE}: helper image falls back to ${FALLBACK_HELPER_IMAGE} (mobile tag); set RESTORE_HELPER_IMAGE to pin it"
  fi
}

# One run for every component (backup-lib.sh select_common_run), before the
# banner prints the timestamp.
RUN_KEYS=()
IFS=',' read -ra REQUESTED <<< "$COMPONENTS"
for part in "${REQUESTED[@]}"; do
  case "$part" in
    mongodb)       RUN_KEYS+=(mongodb mongodb-audit) ;;
    mongodb-audit|mysql|checkpoints|spire) RUN_KEYS+=("$part") ;;
  esac
done
if ! select_common_run "${RUN_KEYS[@]}"; then
  echo "Restore REFUSED: nothing was touched"
  exit 1
fi

if [[ ",${COMPONENTS}," == *,spire,* ]]; then resolve_helper_image; fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — Database Restore (K8s)"
echo "  Backup Dir: ${BACKUP_DIR}"
echo "  Timestamp: ${RESTORE_TIMESTAMP}"
[ -n "$RESTORE_UNTIL" ] && echo "  Until: ${UNTIL_SQL} UTC (point-in-time, excluded)"
echo "  Components: ${COMPONENTS}"
[ -z "$RESTORE_HELPER_IMAGE" ] || echo "  Helper image: ${RESTORE_HELPER_IMAGE}"
echo "══════════════════════════════════════════════════"
echo ""

IFS=',' read -ra PARTS <<< "$COMPONENTS"
# mongodb already restores the audit replica set: never restore it twice.
if [[ " ${PARTS[*]} " == *" mongodb "* ]]; then
  KEPT=()
  for part in "${PARTS[@]}"; do [ "$part" = mongodb-audit ] || KEPT+=("$part"); done
  PARTS=("${KEPT[@]}")
fi
# Logs `restore-timing component=<c> seconds=<n>` after each component really
# restored (not in the checking pass): tests/backup/drill-timings.sh reads these
# lines, and an operator sees what each component costs of the RTO.
run_components() {
  local part started
  for part in "${PARTS[@]}"; do
    started=$SECONDS
    case "$part" in
      mongodb)     restore_mongodb mongodb mongodb-audit ;;
      mongodb-audit) restore_mongodb mongodb-audit ;;
      mysql)       restore_mysql ;;
      checkpoints) restore_checkpoints ;;
      spire)       restore_spire ;;
      # Derived state only (discovery registrations and tokens, DLQ retry queue
      # rebuilt from MongoDB): rebuilt by the services, never restored.
      redis)       warn "Redis is not backed up: its content is rebuilt by the services" ;;
      *)           fail "Unknown component: ${part}" ;;
    esac
    $DRY_RUN || log "restore-timing component=${part} seconds=$((SECONDS - started))"
  done
}

# Every component is checked (backups, checksums, --until chains, archives
# decrypted) before the first one is written: a refusal on MySQL never comes
# after MongoDB was already brought back, which would leave the databases at
# different instants.
if ! $DRY_RUN; then
  log "Checking every component before touching any data..."
  DRY_RUN=true
  run_components
  DRY_RUN=false
  if [ "$RESTORE_FAILURES" -gt 0 ]; then
    echo ""
    echo "══════════════════════════════════════════════════"
    echo "  Restore REFUSED: ${RESTORE_FAILURES} check(s) failed, nothing was touched"
    echo "══════════════════════════════════════════════════"
    exit 1
  fi
  ok "Every component checked: restoring"
  CHECKED=true
fi
RESTORE_STARTED=$SECONDS
run_components
$DRY_RUN || log "restore-timing component=total seconds=$((SECONDS - RESTORE_STARTED))"

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
