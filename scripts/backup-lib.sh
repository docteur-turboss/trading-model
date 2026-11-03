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
#    BACKUP_RUN                 label `run` added to every metric (the
#                               incremental job sets `incremental`), so two
#                               jobs' files can be served side by side
#  Point-in-time recovery (ADR-0031): binlog and oplog archives written by
#  backup-incremental-k8s.sh, replayed by restore-k8s.sh --until.
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
	local component="$1" status="$2" last_success labels
	[ "$status" -eq 1 ] || BACKUP_FAILURES=$((BACKUP_FAILURES + 1))
	[ -n "${METRICS_FILE:-}" ] || return 0
	if [ -z "$_METRICS_TMP" ]; then
		mkdir -p "$(dirname "$METRICS_FILE")"
		_METRICS_TMP="${METRICS_FILE}.tmp"
		: >"$_METRICS_TMP"
	fi
	labels="component=\"${component}\"${BACKUP_RUN:+,run=\"${BACKUP_RUN}\"}"
	if [ "$status" -eq 1 ]; then
		last_success="$(date +%s)"
	else
		# A failure keeps the previous success time, so the staleness alert fires.
		last_success="$(grep -F "backup_last_success_timestamp{${labels}}" "$METRICS_FILE" 2>/dev/null | awk '{print $2}' | tail -1)"
		last_success="${last_success:-0}"
	fi
	{
		echo "backup_last_success_timestamp{${labels}} ${last_success}"
		echo "backup_last_status{${labels}} ${status}"
	} >>"$_METRICS_TMP"
}

# Publishes this run's metrics (replacing the previous run's).
finalize_metrics() {
	[ -n "$_METRICS_TMP" ] || return 0
	local encrypted=0
	[ -n "$AGE_SUFFIX" ] && encrypted=1
	if [ -n "${BACKUP_RUN:-}" ]; then
		echo "backup_encrypted{run=\"${BACKUP_RUN}\"} ${encrypted}" >>"$_METRICS_TMP"
		echo "backup_last_run_timestamp{run=\"${BACKUP_RUN}\"} $(date +%s)" >>"$_METRICS_TMP"
	else
		echo "backup_encrypted ${encrypted}" >>"$_METRICS_TMP"
		echo "backup_last_run_timestamp $(date +%s)" >>"$_METRICS_TMP"
	fi
	mv "$_METRICS_TMP" "$METRICS_FILE"
	ok "Metrics written to ${METRICS_FILE}"
}

# Runs `$2...` and writes its output, sealed, to `$1` through `$1.partial`:
# a failed or interrupted write never leaves a final file behind (the
# `.partial` is deleted, or left by a killed job for the next run to sweep).
sealed_write() {
	local file="$1"
	shift
	if "$@" | seal >"${file}.partial" && [ -s "${file}.partial" ]; then
		mv -f "${file}.partial" "$file"
	else
		rm -f "${file}.partial"
		return 1
	fi
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
		# `:s3:` is an on-the-fly remote: credentials from AWS_*, endpoint and
		# provider from RCLONE_S3_*. Paths keep their timestamped names.
		if RCLONE_S3_ENV_AUTH=true rclone copy --s3-no-check-bucket \
			--files-from "$list" "$BACKUP_DIR" ":s3:${bucket#s3://}"; then
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

# Oplog point (`seconds.increment`) of the newest (`-1`) or oldest (`1`)
# entry of the oplog of MongoDB pod `$1`.
oplog_edge() {
	kubectl_exec "$1" -- mongosh --quiet --eval \
	  "const e = db.getSiblingDB('local').oplog.rs.find({}, {ts: 1}).sort({\$natural: $2}).limit(1).next(); const t = EJSON.serialize({ts: e.ts}).ts.\$timestamp; print(t.t + '.' + t.i)"
}

# Extended JSON of oplog point `$1`.
oplog_json() {
	echo "{\"\$timestamp\":{\"t\":${1%.*},\"i\":${1#*.}}}"
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

# --- Point-in-time recovery (ADR-0031) --------------------------------------
#
# Layout under BACKUP_DIR (all names UTC; `.age` when encrypted):
#   mysql/financial_scraper_<stamp>.pitr        binlog coordinates of the dump
#   mysql/binlog/<server_uuid>/<binlog>_<stamp>.gz
#                                               closed binlog, archived at <stamp>
#   mongodb/<stamp>/<label>.pitr                oplog point read before the dump
#   mongodb/oplog/<label>/<from>_<end>.bson.gz  oplog entries from..end inclusive
# A stamp is `YYYY-MM-DD_HHMMSS`, an oplog point `<seconds>.<increment>`.
# The next oplog archive starts at the previous one's end (one entry shared:
# replaying an oplog entry twice is harmless), so a chain is unbroken exactly
# when every `from` equals the previous `end`.

# Unix time of stamp `$1`.
stamp_epoch() {
	local s="$1"
	date -u -d "${s:0:10} ${s:11:2}:${s:13:2}:${s:15:2}" +%s
}

# 0 when oplog point `$1` <= `$2`.
oplog_le() {
	local at="${1%.*}" ai="${1#*.}" bt="${2%.*}" bi="${2#*.}"
	[ "$at" -lt "$bt" ] || { [ "$at" -eq "$bt" ] && [ "$ai" -le "$bi" ]; }
}

# Value of `key=value` line `$1` read on stdin (PITR metadata files).
pitr_field() {
	sed -n "s/^$1=//p" | head -1
}

# Binlog archives of directory `$1` (one MySQL server), oldest first, as
# `<index> <stamp> <path>` lines. `.partial` files are never listed.
binlog_archives() {
	local path name binlog stamp
	find "$1" -maxdepth 1 -type f \( -name '*.gz' -o -name '*.gz.age' \) 2>/dev/null |
		while read -r path; do
			name="${path##*/}"
			name="${name%.age}"
			name="${name%.gz}"
			# <binlog basename>.<index>_<stamp>, the stamp holding one `_`
			binlog="${name%_*_*}"
			stamp="${name#"${binlog}"_}"
			echo "$((10#${binlog##*.})) ${stamp} ${path}"
		done | sort -n -k1,1
}

# Archives to replay, in order, from binlog `$2` (the dump's) of directory
# `$1` up to stamp `$3`: every archive from the dump's binlog on, up to the
# first run archived at or after `$3` (that run flushed the binary log after
# `$3`, so every earlier event is in a closed, archived file). Fails, with the
# reason on stderr, on a missing binlog or when no archive reaches `$3`.
binlog_chain() {
	local dir="$1" start="$2" until="$3" expected index stamp path cover=""
	expected=$((10#${start##*.}))
	while read -r index stamp path; do
		[ -n "$index" ] || continue
		[ "$index" -lt "$expected" ] && continue
		if [ -n "$cover" ] && [[ "$stamp" > "$cover" ]]; then
			break
		fi
		if [ "$index" -ne "$expected" ]; then
			echo "binlog ${start%.*}.$(printf '%06d' "$expected") is missing from ${dir}: the archives have a gap" >&2
			return 1
		fi
		echo "$path"
		if [ -z "$cover" ] && ! [[ "$stamp" < "$until" ]]; then
			cover="$stamp"
		fi
		expected=$((expected + 1))
	done < <(binlog_archives "$dir")
	if [ -z "$cover" ]; then
		echo "no binlog archived at or after ${until} in ${dir} (from ${start}): the archives do not reach the requested instant" >&2
		return 1
	fi
}

# Oplog archives of directory `$1`, oldest first, as `<from> <end> <path>`.
oplog_archives() {
	local path name
	find "$1" -maxdepth 1 -type f \( -name '*.bson.gz' -o -name '*.bson.gz.age' \) 2>/dev/null |
		while read -r path; do
			name="${path##*/}"
			name="${name%.age}"
			name="${name%.bson.gz}"
			echo "${name%_*} ${name#*_} ${path}"
		done | sort -t. -k1,1n -k2,2n
}

# Archives to replay, in order, from oplog point `$2` (read before the dump)
# up to Unix time `$3`, in directory `$1`: from the archive holding `$2`
# through the first one ending at or after `$3`. Fails, with the reason on
# stderr, when an archive is missing between the two.
oplog_chain() {
	local dir="$1" start="$2" until="$3" from end path prev="" covered=false
	while read -r from end path; do
		[ -n "$from" ] || continue
		if [ -z "$prev" ]; then
			oplog_le "$end" "$start" && [ "$end" != "$start" ] && continue
			if ! oplog_le "$from" "$start"; then
				echo "no oplog archive in ${dir} holds ${start} (first one starts at ${from}): the archives have a gap" >&2
				return 1
			fi
		elif [ "$from" != "$prev" ]; then
			echo "oplog archives of ${dir} have a gap between ${prev} and ${from}" >&2
			return 1
		fi
		echo "$path"
		prev="$end"
		if [ "${end%.*}" -ge "$until" ]; then
			covered=true
			break
		fi
	done < <(oplog_archives "$dir")
	if [ -z "$prev" ]; then
		echo "no oplog archive in ${dir} holds ${start}" >&2
		return 1
	fi
	if ! $covered; then
		echo "the oplog archives of ${dir} end at ${prev}, before the requested instant" >&2
		return 1
	fi
}
