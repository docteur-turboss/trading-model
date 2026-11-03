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
#
#  Run manifest (docs/deployment/BACKUP_DR.md, "Run manifest"): every dump is
#  written to `<file>.partial` and renamed only once the whole pipeline
#  succeeded, so a failed or killed dump never leaves a final file. Each run
#  then writes `manifests/manifest_<TIMESTAMP>.json[.age]` listing the dumps
#  that succeeded (path, size on disk, sha256 of the plaintext); the restore
#  scripts pick the newest run whose manifest lists the component and check
#  the file against it before applying it.
# =============================================================================

AGE_SUFFIX=""
AGE_ARGS=()
OUTPUTS=()
MANIFEST_ENTRIES=()
BACKUP_FAILURES=0
_METRICS_TMP=""
# sha256 of an empty input: a dump with no plaintext is never a backup.
EMPTY_SHA256="e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

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

# Registers a written backup file for the off-site copy.
record_output() {
	OUTPUTS+=("${1#"${BACKUP_DIR}"/}")
}

# Size in bytes of file `$1`.
file_size() {
	wc -c <"$1" | tr -d ' '
}

# write_dump <key> <file> <command...>
# Runs the command and writes its stdout, sealed, to `<file>.partial`; the
# sha256 of the plaintext is computed on the fly (no plaintext on disk). Only
# when every stage succeeded and the output is not empty is the partial file
# renamed to `<file>`, registered for the off-site copy and listed in the run
# manifest under `<key>`. Otherwise nothing is left behind and it returns 1.
write_dump() {
	local key="$1" file="$2"
	shift 2
	local partial="${file}.partial" work sum size written=true
	rm -f "$partial"
	work="$(mktemp -d)"
	mkfifo "$work/plain"
	# tee feeds the hasher through the FIFO while the dump is sealed.
	sha256sum <"$work/plain" >"$work/sum" &
	local hasher=$!
	if ! "$@" | tee "$work/plain" | seal >"$partial"; then
		written=false
	fi
	if ! wait "$hasher"; then
		written=false
	fi
	sum="$(cut -d' ' -f1 "$work/sum" 2>/dev/null || true)"
	rm -rf "$work"
	if $written && [ "${#sum}" -ne 64 ]; then
		fail "No checksum computed for ${file}"
		written=false
	fi
	if $written && [ "$sum" = "$EMPTY_SHA256" ]; then
		fail "Empty dump for ${key}: ${file} not kept"
		written=false
	fi
	if ! $written; then
		rm -f "$partial"
		return 1
	fi
	mv "$partial" "$file"
	size="$(file_size "$file")"
	record_output "$file"
	MANIFEST_ENTRIES+=("$(printf '{"component":"%s","path":"%s","size":%s,"sha256":"%s"}' \
		"$key" "${file#"${BACKUP_DIR}"/}" "$size" "$sum")")
}

# Writes this run's manifest (`manifests/manifest_<TIMESTAMP>.json`, sealed
# like the dumps) atomically and registers it for the off-site copy. One
# entry per line: the restore scripts read it without jq. Nothing is written
# when no dump succeeded. Returns 1 (metric component "manifest" 0) when the
# manifest cannot be written: the dumps of the run are then not restorable
# without --timestamp.
write_manifest() {
	[ "${#MANIFEST_ENTRIES[@]}" -gt 0 ] || return 0
	local dir="${BACKUP_DIR}/manifests"
	local file="${dir}/manifest_${TIMESTAMP}.json${AGE_SUFFIX}"
	local i last=$((${#MANIFEST_ENTRIES[@]} - 1))
	mkdir -p "$dir"
	if ! {
		printf '{"version":1,"timestamp":"%s","entries":[\n' "$TIMESTAMP"
		for i in "${!MANIFEST_ENTRIES[@]}"; do
			if [ "$i" -lt "$last" ]; then
				printf '%s,\n' "${MANIFEST_ENTRIES[$i]}"
			else
				printf '%s\n' "${MANIFEST_ENTRIES[$i]}"
			fi
		done
		printf ']}\n'
	} | seal >"${file}.partial"; then
		rm -f "${file}.partial"
		fail "Run manifest not written: ${file}"
		write_metric "manifest" 0
		return 1
	fi
	mv "${file}.partial" "$file"
	record_output "$file"
	ok "Run manifest written: ${file} (${#MANIFEST_ENTRIES[@]} dump(s))"
	write_metric "manifest" 1
}

# --- Restore side: run manifests ---------------------------------------------

# Manifest of run `$1` (path, encrypted or not), empty when that run has none.
manifest_of() {
	backup_file "${BACKUP_DIR}/manifests/manifest_$1.json"
}

# Manifests, newest run first.
manifests_newest_first() {
	find "${BACKUP_DIR}/manifests" -maxdepth 1 -type f \
		\( -name 'manifest_*.json' -o -name 'manifest_*.json.age' \) 2>/dev/null | sort -r
}

# Prints `<path> <size> <sha256>` of entry `$2` in manifest file `$1`
# (nothing when the run has no such entry). Returns 1 when the manifest
# cannot be read.
manifest_entry() {
	local manifest="$1" key="$2" content
	if ! content="$(open_backup "$manifest" </dev/null)"; then
		fail "Cannot read the run manifest ${manifest}"
		return 1
	fi
	printf '%s\n' "$content" | sed -n \
		's/^{"component":"'"$key"'","path":"\([^"]*\)","size":\([0-9]*\),"sha256":"\([0-9a-f]*\)"}.*$/\1 \2 \3/p' | head -1
}

# resolve_backup <key> <legacy path...>
# Sets RESOLVED_FILE, RESOLVED_SIZE, RESOLVED_SHA256 for manifest entry `<key>`:
#   RESTORE_TIMESTAMP=latest  the newest run whose manifest lists `<key>` (a
#                             run whose file is gone is skipped with a warning);
#                             backups without manifest are never picked
#   RESTORE_TIMESTAMP=<ts>    that run: refused when its manifest does not
#                             list `<key>`; a run without manifest (backups
#                             taken before manifests) falls back to the first
#                             existing legacy path, with a warning and no
#                             checksum (RESOLVED_SHA256 empty)
# Returns 1 (after `fail`) when no backup can be restored.
resolve_backup() {
	local key="$1"
	shift
	RESOLVED_FILE="" RESOLVED_SIZE="" RESOLVED_SHA256=""
	local manifest entry path
	if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
		local found=false
		while read -r manifest; do
			[ -n "$manifest" ] || continue
			found=true
			entry="$(manifest_entry "$manifest" "$key")" || return 1
			[ -n "$entry" ] || continue
			read -r path RESOLVED_SIZE RESOLVED_SHA256 <<<"$entry"
			if [ ! -f "${BACKUP_DIR}/${path}" ]; then
				warn "${key}: ${path} listed in $(basename "$manifest") is missing, trying an older run"
				continue
			fi
			RESOLVED_FILE="${BACKUP_DIR}/${path}"
			return 0
		done < <(manifests_newest_first)
		if ! $found; then
			fail "${key}: no run manifest in ${BACKUP_DIR}/manifests; backups taken before manifests are restored with an explicit --timestamp"
		else
			fail "${key}: no complete backup in any run manifest of ${BACKUP_DIR}/manifests"
		fi
		return 1
	fi
	manifest="$(manifest_of "$RESTORE_TIMESTAMP")"
	if [ -n "$manifest" ]; then
		entry="$(manifest_entry "$manifest" "$key")" || return 1
		if [ -z "$entry" ]; then
			fail "${key}: run ${RESTORE_TIMESTAMP} did not back it up successfully (absent from $(basename "$manifest"))"
			return 1
		fi
		read -r path RESOLVED_SIZE RESOLVED_SHA256 <<<"$entry"
		if [ ! -f "${BACKUP_DIR}/${path}" ]; then
			fail "${key}: ${BACKUP_DIR}/${path} listed in $(basename "$manifest") is missing"
			return 1
		fi
		RESOLVED_FILE="${BACKUP_DIR}/${path}"
		return 0
	fi
	for path in "$@"; do
		[ -n "$path" ] && [ -e "$path" ] || continue
		warn "${key}: run ${RESTORE_TIMESTAMP} has no manifest (taken before manifests): ${path} is restored without checksum"
		RESOLVED_FILE="$path"
		return 0
	done
	fail "${key}: no backup for run ${RESTORE_TIMESTAMP} in ${BACKUP_DIR}"
	return 1
}

# verify_backup <file> <size> <sha256>
# Refuses (`fail`, returns 1) a file whose size or plaintext sha256 differs
# from its manifest entry. No check without a recorded sha256 (legacy runs).
verify_backup() {
	local file="$1" size="$2" sha="$3" actual
	[ -n "$sha" ] || return 0
	actual="$(file_size "$file")"
	if [ "$actual" != "$size" ]; then
		fail "${file}: ${actual} bytes, the run manifest says ${size}: refused"
		return 1
	fi
	if ! actual="$(open_backup "$file" | sha256sum | cut -d' ' -f1)"; then
		fail "${file}: cannot be read: refused"
		return 1
	fi
	if [ "$actual" != "$sha" ]; then
		fail "${file}: sha256 ${actual} differs from the run manifest (${sha}): refused"
		return 1
	fi
	ok "Checksum verified: ${file}"
}

# resolve_and_verify <key> <legacy path...>
# resolve_backup, then refuses an empty file and checks it against its
# manifest entry (verify_backup). Sets RESOLVED_FILE; returns 1 (after
# `fail`) when there is nothing safe to restore.
resolve_and_verify() {
	resolve_backup "$@" || return 1
	log "Restoring ${1} from: ${RESOLVED_FILE}"
	if [ -f "$RESOLVED_FILE" ] && [ ! -s "$RESOLVED_FILE" ]; then
		fail "${1} backup is empty: ${RESOLVED_FILE}"
		return 1
	fi
	verify_backup "$RESOLVED_FILE" "$RESOLVED_SIZE" "$RESOLVED_SHA256"
}

# Refuses (`fail`, returns 1) a gzipped mysqldump `$1` whose last non-empty
# line is not mysqldump's closing `-- Dump completed` comment: the dump was
# cut short and would drop tables it cannot recreate.
verify_mysql_dump_complete() {
	local file="$1" last
	if ! last="$(open_backup "$file" | gunzip | awk 'NF { l = $0 } END { print l }')"; then
		fail "${file}: cannot be decompressed: refused"
		return 1
	fi
	case "$last" in
	"-- Dump completed"*) return 0 ;;
	esac
	fail "${file}: the dump does not end with '-- Dump completed' (truncated): refused"
	return 1
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

# Deletes the backup files and run manifests older than RETENTION_DAYS
# (off-site copies follow the bucket's own lifecycle rules), and the
# `*.partial` files a killed run (OOM, activeDeadlineSeconds) left behind:
# this run renamed or deleted its own, so any older than an hour is an orphan.
prune_old() {
	log "Pruning backups older than ${RETENTION_DAYS} days..."
	find "${BACKUP_DIR}" -mindepth 2 -type f -name '*.partial' -mmin +60 -delete 2>/dev/null || true
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
