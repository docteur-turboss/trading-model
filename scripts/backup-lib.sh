# shellcheck shell=bash
# =============================================================================
#  Trading Model — backup helpers, sourced by backup.sh, backup-k8s.sh,
#  restore.sh and restore-k8s.sh (which define log/ok/fail/warn first).
#
#  Encryption (age, https://age-encryption.org):
#    BACKUP_AGE_RECIPIENTS      age public keys (age1..., space or newline
#                               separated). Every dump is piped through age
#                               while it is written: no plaintext copy ever
#                               reaches the disk. Files get the `.age` suffix
#    BACKUP_REQUIRE_ENCRYPTION  true: refuse to back up without recipients
#    BACKUP_AGE_IDENTITY        private key file, read by the restore scripts
#                               to decrypt `*.age` files
#  Off-site copy (only encrypted files ever leave):
#    BACKUP_S3_BUCKET           s3://bucket/prefix; rclone reads the AWS_*
#                               credentials, RCLONE_S3_ENDPOINT/PROVIDER for a
#                               non-AWS store (MinIO, B2, Scaleway, OVH...)
#    BACKUP_REQUIRE_OFFSITE     true: a run without off-site copy fails
#                               (backup_last_status{component="offsite"} 0)
#  Metrics: METRICS_FILE, rewritten atomically at the end of each run.
# =============================================================================

AGE_SUFFIX=""
AGE_ARGS=()
OUTPUTS=()
BACKUP_FAILURES=0
_METRICS_TMP=""

init_encryption() {
	local recipient count=0
	for recipient in ${BACKUP_AGE_RECIPIENTS:-}; do
		AGE_ARGS+=(-r "$recipient")
		count=$((count + 1))
	done
	if [ "$count" -eq 0 ]; then
		if [ "${BACKUP_REQUIRE_ENCRYPTION:-false}" = true ]; then
			fail "BACKUP_REQUIRE_ENCRYPTION=true but BACKUP_AGE_RECIPIENTS is empty: no backup written"
			return 1
		fi
		warn "BACKUP_AGE_RECIPIENTS is not set: backups are written UNENCRYPTED"
		return 0
	fi
	if ! command -v age >/dev/null; then
		fail "age is not installed"
		return 1
	fi
	# Rejects a malformed key now rather than after the first dump.
	if ! echo | age "${AGE_ARGS[@]}" >/dev/null; then
		fail "BACKUP_AGE_RECIPIENTS holds an invalid age public key"
		return 1
	fi
	AGE_SUFFIX=".age"
	ok "Backups encrypted with age for ${count} recipient(s)"
}

# stdin → stdout, encrypted for the recipients when encryption is on.
seal() {
	if [ -n "$AGE_SUFFIX" ]; then
		age "${AGE_ARGS[@]}"
	else
		cat
	fi
}

# Writes a backup file's plaintext to stdout (decrypting `*.age`).
open_backup() {
	local file="$1"
	case "$file" in
	*.age)
		if [ -z "${BACKUP_AGE_IDENTITY:-}" ]; then
			fail "${file} is encrypted: set BACKUP_AGE_IDENTITY to the age private key file"
			return 1
		fi
		age -d -i "$BACKUP_AGE_IDENTITY" "$file"
		;;
	*) cat "$file" ;;
	esac
}

# The backup at `$1` (path without the `.age` suffix), encrypted or not.
backup_file() {
	if [ -f "$1.age" ]; then
		echo "$1.age"
	elif [ -f "$1" ]; then
		echo "$1"
	fi
}

# Newest file of directory `$1` whose name matches `$2` (with or without `.age`).
latest_backup() {
	find "$1" \( -name "$2" -o -name "$2.age" \) 2>/dev/null | sort | tail -1
}

# Registers a written backup file for the off-site copy.
record_output() {
	OUTPUTS+=("${1#"${BACKUP_DIR}"/}")
}

write_metric() {
	local component="$1" status="$2" last_success
	[ "$status" -eq 1 ] || BACKUP_FAILURES=$((BACKUP_FAILURES + 1))
	[ -n "${METRICS_FILE:-}" ] || return 0
	if [ -z "$_METRICS_TMP" ]; then
		mkdir -p "$(dirname "$METRICS_FILE")"
		_METRICS_TMP="${METRICS_FILE}.tmp"
		: >"$_METRICS_TMP"
	fi
	if [ "$status" -eq 1 ]; then
		last_success="$(date +%s)"
	else
		# A failure keeps the previous success time, so the staleness alert fires.
		last_success="$(grep -F "backup_last_success_timestamp{component=\"${component}\"}" "$METRICS_FILE" 2>/dev/null | awk '{print $2}' | tail -1)"
		last_success="${last_success:-0}"
	fi
	{
		echo "backup_last_success_timestamp{component=\"${component}\"} ${last_success}"
		echo "backup_last_status{component=\"${component}\"} ${status}"
	} >>"$_METRICS_TMP"
}

# Publishes this run's metrics (replacing the previous run's).
finalize_metrics() {
	[ -n "$_METRICS_TMP" ] || return 0
	echo "backup_encrypted $([ -n "$AGE_SUFFIX" ] && echo 1 || echo 0)" >>"$_METRICS_TMP"
	echo "backup_last_run_timestamp $(date +%s)" >>"$_METRICS_TMP"
	mv "$_METRICS_TMP" "$METRICS_FILE"
	ok "Metrics written to ${METRICS_FILE}"
}

# rclone remote of the off-site bucket `$1` (s3://bucket/prefix), shared by
# upload_offsite and fetch-offsite.sh. `:s3:` is an on-the-fly remote:
# credentials from AWS_* (with RCLONE_S3_ENV_AUTH=true), endpoint and provider
# from RCLONE_S3_*.
offsite_remote() {
	echo ":s3:${1#s3://}"
}

upload_offsite() {
	local bucket="${BACKUP_S3_BUCKET:-}"
	if [ -z "$bucket" ]; then
		if [ "${BACKUP_REQUIRE_OFFSITE:-false}" = true ]; then
			fail "BACKUP_REQUIRE_OFFSITE=true but BACKUP_S3_BUCKET is empty: the backups stay on a single volume"
			write_metric "offsite" 0
		fi
		return 0
	fi
	if [ -z "$AGE_SUFFIX" ]; then
		fail "Refusing to copy unencrypted backups off-site: set BACKUP_AGE_RECIPIENTS"
		write_metric "offsite" 0
		return 0
	fi
	if [ "${#OUTPUTS[@]}" -eq 0 ]; then
		warn "No backup file written: nothing to copy off-site"
		return 0
	fi
	log "Copying ${#OUTPUTS[@]} encrypted file(s) to ${bucket}"
	local list
	list="$(mktemp)"
	printf '%s\n' "${OUTPUTS[@]}" >"$list"
	local copied=false
	if command -v rclone >/dev/null; then
		# Paths keep their timestamped names (fetch-offsite.sh relies on it).
		if RCLONE_S3_ENV_AUTH=true rclone copy --s3-no-check-bucket \
			--files-from "$list" "$BACKUP_DIR" "$(offsite_remote "$bucket")"; then
			copied=true
		fi
	elif command -v aws >/dev/null; then
		copied=true
		local file
		while read -r file; do
			aws s3 cp --quiet "${BACKUP_DIR}/${file}" "${bucket%/}/${file}" || copied=false
		done <"$list"
	else
		fail "Neither rclone nor aws is installed: off-site copy skipped"
		write_metric "offsite" 0
		rm -f "$list"
		return 0
	fi
	rm -f "$list"
	if $copied; then
		ok "Off-site copy complete"
		write_metric "offsite" 1
	else
		fail "Off-site copy failed"
		write_metric "offsite" 0
	fi
}

# Deletes the backup files older than RETENTION_DAYS (off-site copies follow
# the bucket's own lifecycle rules).
prune_old() {
	log "Pruning backups older than ${RETENTION_DAYS} days..."
	find "${BACKUP_DIR}" -mindepth 2 -type f -mtime "+${RETENTION_DAYS}" -not -path "*/metrics/*" -delete 2>/dev/null || true
	find "${BACKUP_DIR}" -mindepth 2 -type d -empty -delete 2>/dev/null || true
	ok "Old backups pruned"
}

# --- Kubernetes (backup-k8s.sh, restore-k8s.sh) -----------------------------

kubectl_exec() {
	kubectl exec -n "${K8S_NAMESPACE}" "$@" 2>/dev/null
}

# Names of the pods carrying `app.kubernetes.io/component=$1`.
component_pods() {
	kubectl get pods -n "${K8S_NAMESPACE}" -l "app.kubernetes.io/component=$1" \
		-o jsonpath='{.items[*].metadata.name}' 2>/dev/null || true
}

# The writable primary of the MongoDB replica set labelled `$1`: dumps read
# a consistent oplog from it and restores can only write there.
mongo_primary() {
	local pod
	for pod in $(component_pods "$1"); do
		if [ "$(kubectl_exec "${pod}" -- mongosh --quiet --eval 'db.hello().isWritablePrimary')" = "true" ]; then
			echo "${pod}"
			return 0
		fi
	done
	return 1
}

# The MySQL pod the `mysql-primary` Service writes to (replicas do not).
mysql_primary_pod() {
	local pod
	pod=$(kubectl get service -n "${K8S_NAMESPACE}" mysql-primary \
		-o jsonpath='{.spec.selector.statefulset\.kubernetes\.io/pod-name}' 2>/dev/null || true)
	if [ -z "$pod" ]; then
		pod=$(component_pods mysql | awk '{print $1}')
	fi
	[ -n "$pod" ] && echo "${pod}"
}

# Runs `$2` with sh in the mysql container of pod `$1`, logged in as root
# with the container's own password (never on a command line).
mysql_root_sh() {
	kubectl exec -i -n "${K8S_NAMESPACE}" "$1" -c mysql -- \
		sh -c "export MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\"; $2"
}

# Shell command (run in the MySQL container, MYSQL_PWD set) dumping every
# non-system database: financial_scraper, spire (SPIRE datastore)... The
# `mysql` schema is left out: it cannot be restored over a running server.
# No GTID statement: the restore must go through the binlog to the replicas.
MYSQL_DUMP_SH="dbs=\$(mysql --user=root -N -e \"SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('mysql', 'sys', 'information_schema', 'performance_schema')\") && exec mysqldump --user=root --databases \$dbs --single-transaction --quick --routines --events --set-gtid-purged=OFF"

# stdin → stdout: drops the GTID statements of a mysqldump taken with
# --set-gtid-purged=ON (older backups). Restoring them into a running server
# fails (GTID_PURGED overlaps gtid_executed) and SQL_LOG_BIN=0 would keep the
# restore out of the binlog, hence off the replicas.
strip_gtid() {
	awk '
		skip { if (/;[[:space:]]*$/) skip = 0; next }
		/^SET @@GLOBAL\.GTID_PURGED/ { if (!/;[[:space:]]*$/) skip = 1; next }
		/^SET @@SESSION\.SQL_LOG_BIN/ { next }
		/^SET @MYSQLDUMP_TEMP_LOG_BIN/ { next }
		{ print }
	'
}
