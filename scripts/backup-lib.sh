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

# Writes a backup file's plaintext to stdout (decrypting `*.age`). Its own
# error goes to stderr: callers capture or pipe its stdout, and a message
# written there would be swallowed (callers report the failure again).
open_backup() {
	local file="$1"
	case "$file" in
	*.age)
		if [ -z "${BACKUP_AGE_IDENTITY:-}" ]; then
			fail "${file} is encrypted: set BACKUP_AGE_IDENTITY to the age private key file" >&2
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
	if ! work="$(mktemp -d)" || ! mkfifo "$work/plain"; then
		[ -z "${work:-}" ] || rm -rf "$work"
		fail "${key}: cannot create the checksum FIFO in ${TMPDIR:-/tmp}: ${file} not written"
		return 1
	fi
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
	# Called from an `if`: set -e is off, so a failed rename must be caught here.
	if ! mv "$partial" "$file"; then
		rm -f "$partial"
		fail "Cannot rename ${partial} to ${file}"
		return 1
	fi
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
	if ! mv "${file}.partial" "$file"; then
		rm -f "${file}.partial"
		fail "Run manifest not renamed: ${file}"
		write_metric "manifest" 0
		return 1
	fi
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

# One manifest entry line, as written by write_dump (trailing comma optional).
MANIFEST_ENTRY_RE='^\{"component":"[^"]+","path":"[^"]+","size":[0-9]+,"sha256":"[0-9a-f]{64}"\},?$'

# Prints `<path> <size> <sha256>` of entry `$2` in manifest file `$1`
# (nothing when the run has no such entry). Returns 1 when the manifest
# cannot be read (decryption failed), 2 when its content is not a version 1
# manifest as write_manifest writes it (header `{"version":1,`, one entry per
# line, footer `]}`) or an entry path leaves BACKUP_DIR: a corrupt or
# truncated plaintext manifest must be refused, not read as "no such entry".
# Always called in a command substitution: it never calls `fail` itself (its
# message and the RESTORE_FAILURES increment would stay in the subshell), its
# caller does (read_manifest_entry).
manifest_entry() {
	local manifest="$1" key="$2" content body line
	content="$(open_backup "$manifest" </dev/null)" || return 1
	# Drop empty lines; $(…) already removed the trailing newline.
	content="$(printf '%s\n' "$content" | awk 'NF')"
	[[ "$(printf '%s\n' "$content" | head -1)" =~ ^\{\"version\":1,\"timestamp\":\"[0-9_-]+\",\"entries\":\[$ ]] || return 2
	[ "$(printf '%s\n' "$content" | tail -1)" = ']}' ] || return 2
	body="$(printf '%s\n' "$content" | sed '1d;$d')"
	[ -n "$body" ] || return 2
	while IFS= read -r line; do
		[[ "$line" =~ $MANIFEST_ENTRY_RE ]] || return 2
		case "$line" in
		*'"path":"/'* | *'"path":"..'* | *'/../'* | *'/.."'*) return 2 ;;
		esac
	done <<<"$body"
	printf '%s\n' "$body" | sed -n \
		's/^{"component":"'"$key"'","path":"\([^"]*\)","size":\([0-9]*\),"sha256":"\([0-9a-f]*\)"}.*$/\1 \2 \3/p' | head -1
}

# read_manifest_entry <key> <manifest>
# Sets MANIFEST_ENTRY to entry `<key>` of `<manifest>` (empty when the run has
# no such entry). Returns 1 after `fail`, in the caller's shell, when the
# manifest cannot be read (no or wrong BACKUP_AGE_IDENTITY, corrupt file):
# the restore then exits 1 instead of skipping the component silently.
read_manifest_entry() {
	local key="$1" manifest="$2"
	MANIFEST_ENTRY=""
	case "$manifest" in
	*.age)
		if [ -z "${BACKUP_AGE_IDENTITY:-}" ]; then
			fail "${key}: the run manifest ${manifest} is encrypted: set BACKUP_AGE_IDENTITY to the age private key file"
			return 1
		fi
		if [ ! -r "$BACKUP_AGE_IDENTITY" ]; then
			fail "${key}: BACKUP_AGE_IDENTITY=${BACKUP_AGE_IDENTITY} is not a readable file"
			return 1
		fi
		;;
	esac
	local rc=0
	MANIFEST_ENTRY="$(manifest_entry "$manifest" "$key")" || rc=$?
	if [ "$rc" -eq 2 ]; then
		MANIFEST_ENTRY=""
		fail "${key}: the run manifest ${manifest} is corrupt or truncated (not a version 1 manifest): refused; restore an older run with --timestamp"
		return 1
	fi
	if [ "$rc" -ne 0 ]; then
		MANIFEST_ENTRY=""
		fail "${key}: cannot read the run manifest ${manifest} (wrong BACKUP_AGE_IDENTITY or corrupt file): refused; restore an older run with --timestamp"
		return 1
	fi
}

# resolve_backup <key> <legacy path...>
# Sets RESOLVED_FILE, RESOLVED_SIZE, RESOLVED_SHA256 for manifest entry `<key>`:
#   RESTORE_TIMESTAMP=latest  the newest run whose manifest lists `<key>` (a
#                             run whose file is gone is skipped with a warning);
#                             backups without manifest are never picked. With
#                             RESTORE_NOT_AFTER=<ts> (restore-k8s.sh --until),
#                             runs taken after <ts> are skipped
#   RESTORE_TIMESTAMP=<ts>    that run: refused when its manifest does not
#                             list `<key>`; a run without manifest (backups
#                             taken before manifests) falls back to the first
#                             existing legacy path, with a warning and no
#                             checksum (RESOLVED_SHA256 empty)
# Returns 1 (after `fail`) when no backup can be restored, including when a
# manifest it has to read is unreadable: `latest` never skips such a run.
resolve_backup() {
	local key="$1"
	shift
	RESOLVED_FILE="" RESOLVED_SIZE="" RESOLVED_SHA256=""
	local manifest entry path
	if [ "$RESTORE_TIMESTAMP" = "latest" ]; then
		local found=false
		local stamp
		while read -r manifest; do
			[ -n "$manifest" ] || continue
			if [ -n "${RESTORE_NOT_AFTER:-}" ]; then
				stamp="${manifest##*/manifest_}"
				stamp="${stamp%%.json*}"
				[[ "$stamp" > "$RESTORE_NOT_AFTER" ]] && continue
			fi
			found=true
			read_manifest_entry "$key" "$manifest" || return 1
			entry="$MANIFEST_ENTRY"
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
			fail "${key}: no run manifest in ${BACKUP_DIR}/manifests${RESTORE_NOT_AFTER:+ taken at or before ${RESTORE_NOT_AFTER}}; backups taken before manifests are restored with an explicit --timestamp"
		else
			fail "${key}: no complete backup in any run manifest of ${BACKUP_DIR}/manifests"
		fi
		return 1
	fi
	manifest="$(manifest_of "$RESTORE_TIMESTAMP")"
	if [ -n "$manifest" ]; then
		read_manifest_entry "$key" "$manifest" || return 1
		entry="$MANIFEST_ENTRY"
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
# A file already verified against the same entry by this process is not read
# again (restore-k8s.sh checks every component before restoring them).
_VERIFIED_BACKUPS=""
verify_backup() {
	local file="$1" size="$2" sha="$3" actual
	[ -n "$sha" ] || return 0
	case "$_VERIFIED_BACKUPS" in
	*"|${file} ${size} ${sha}|"*) return 0 ;;
	esac
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
	_VERIFIED_BACKUPS="${_VERIFIED_BACKUPS}|${file} ${size} ${sha}|"
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

# write_pitr_gap <component> <0|1>: whether the archive chain of the
# component is broken after the newest daily dump (backup-incremental-k8s.sh,
# alert BackupPitrGap). Counted as neither a success nor a failure.
write_pitr_gap() {
	[ -n "${METRICS_FILE:-}" ] || return 0
	if [ -z "$_METRICS_TMP" ]; then
		mkdir -p "$(dirname "$METRICS_FILE")"
		_METRICS_TMP="${METRICS_FILE}.tmp"
		: >"$_METRICS_TMP"
	fi
	echo "backup_pitr_gap{component=\"$1\"${BACKUP_RUN:+,run=\"${BACKUP_RUN}\"}} $2" >>"$_METRICS_TMP"
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

# check_offsite_lifecycle <s3://bucket/prefix>
# Tiered layout only: warns when the bucket has no lifecycle rule for one of
# the prefixes `<prefix>/daily/`, `weekly/`, `monthly/` (rules to set:
# docs/deployment/BACKUP_DR.md, "Off-site tiers"). Needs the `aws` CLI and
# s3:GetLifecycleConfiguration; without them it says the rules were not
# verified. Never fails the run: the job's credentials need no lifecycle
# right, and the copy itself succeeded.
check_offsite_lifecycle() {
	local bucket="${1#s3://}" name prefix rules tier missing=""
	name="${bucket%%/*}"
	prefix=""
	[ "$name" = "$bucket" ] || prefix="${bucket#*/}"
	prefix="${prefix%/}"
	[ -z "$prefix" ] || prefix="${prefix}/"
	if ! command -v aws >/dev/null; then
		warn "Off-site lifecycle rules not verified (no aws CLI): ${prefix}daily/, ${prefix}weekly/, ${prefix}monthly/ must expire after 31, 85 and 1830 days (BACKUP_DR.md)"
		return 0
	fi
	local endpoint=()
	[ -z "${RCLONE_S3_ENDPOINT:-}" ] || endpoint=(--endpoint-url "$RCLONE_S3_ENDPOINT")
	if ! rules="$(aws "${endpoint[@]}" s3api get-bucket-lifecycle-configuration --bucket "$name" 2>&1)"; then
		warn "Off-site lifecycle rules not verified for ${name}: ${rules}"
		return 0
	fi
	for tier in daily weekly monthly; do
		grep -qF "\"${prefix}${tier}/\"" <<<"$rules" || missing="${missing} ${prefix}${tier}/"
	done
	if [ -n "$missing" ]; then
		warn "Bucket ${name} has no lifecycle rule for:${missing}: those copies are never expired (BACKUP_DR.md, Off-site tiers)"
	else
		ok "Off-site lifecycle rules present for ${prefix}daily/, weekly/, monthly/"
	fi
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
	if ! command -v rclone >/dev/null && ! command -v aws >/dev/null; then
		fail "Neither rclone nor aws is installed: off-site copy skipped"
		write_metric "offsite" 0
		return 0
	fi
	local layout="${BACKUP_OFFSITE_LAYOUT:-flat}" work file tier copied=true
	work="$(mktemp -d)"
	case "$layout" in
	# flat.list: copied to the bucket root, the layout before ADR-0032.
	flat) printf '%s\n' "${OUTPUTS[@]}" >"$work/flat.list" ;;
	tiered)
		for file in "${OUTPUTS[@]}"; do
			for tier in $(offsite_tiers "$file"); do
				echo "$file" >>"$work/${tier}.list"
			done
		done
		;;
	*)
		fail "BACKUP_OFFSITE_LAYOUT must be flat or tiered, not '${layout}': off-site copy skipped"
		write_metric "offsite" 0
		rm -rf "$work"
		return 0
		;;
	esac
	local list dest
	for list in "$work"/*.list; do
		[ -f "$list" ] || continue
		tier="$(basename "$list" .list)"
		dest="${bucket%/}"
		[ "$tier" = flat ] || dest="${dest}/${tier}"
		log "Copying $(wc -l <"$list" | tr -d ' ') encrypted file(s) to ${dest}"
		if command -v rclone >/dev/null; then
			# Paths keep their timestamped names (fetch-offsite.sh relies on it).
			RCLONE_S3_ENV_AUTH=true rclone copy --s3-no-check-bucket \
				--files-from "$list" "$BACKUP_DIR" "$(offsite_remote "$dest")" || copied=false
		else
			while read -r file; do
				aws s3 cp --quiet "${BACKUP_DIR}/${file}" "${dest}/${file}" || copied=false
			done <"$list"
		fi
	done
	rm -rf "$work"
	if [ "$layout" = tiered ]; then
		check_offsite_lifecycle "$bucket"
	fi
	if $copied; then
		ok "Off-site copy complete"
		write_metric "offsite" 1
	else
		fail "Off-site copy failed"
		write_metric "offsite" 0
	fi
}

# Registers for the off-site copy every binlog and oplog archive still on the
# volume (backup-incremental-k8s.sh, after pruning), not only this run's: an
# archive whose copy failed once is sent again by the next run, so the chain
# off-site has no hole left by a transient S3 failure. rclone skips the files
# already in the bucket (same size and modification time).
record_incremental_archives() {
	local dir path
	for dir in "${BACKUP_DIR}/mysql/binlog" "${BACKUP_DIR}/mongodb/oplog"; do
		[ -d "$dir" ] || continue
		while read -r path; do
			[ -n "$path" ] || continue
			case " ${OUTPUTS[*]} " in
			*" ${path#"${BACKUP_DIR}"/} "*) continue ;;
			esac
			record_output "$path"
		done < <(find "$dir" -type f \( -name '*.gz' -o -name '*.gz.age' \) | sort)
	done
}

# --- Retention: grandfather-father-son (ADR-0032) ----------------------------
#
#  RETENTION_DAYS             daily tier: every run is kept this many days
#                             (default 30)
#  RETENTION_WEEKLY_WEEKS     weekly tier on the local volume: the first
#                             complete run of each ISO week (Monday-Sunday) is
#                             kept this many weeks (default 0: none)
#  RETENTION_MONTHLY_MONTHS   monthly tier on the local volume: the first
#                             complete run of each calendar month is kept this
#                             many months (default 0: none)
#  RETENTION_LONG_COMPONENTS  components promoted to the weekly and monthly
#                             tiers, locally and off-site (manifest keys,
#                             default "mongodb-audit mysql")
#  BACKUP_OFFSITE_LAYOUT      flat (default): `<bucket>/<path>`; tiered:
#                             `<bucket>/daily/<path>` for every file, plus
#                             `weekly/` and `monthly/` copies of the promoted
#                             dumps and their manifest, so that one lifecycle
#                             rule per prefix applies the policy in the bucket
#
#  A run is complete for a component when its manifest exists and its final
#  dump file exists (write_dump only renames a dump that succeeded; the
#  manifest is written at the end of the run). Only complete runs are
#  promoted. The newest complete run of each component is never deleted,
#  whatever its age. Ages come from the timestamp in the file name, never
#  from the mtime (a copy or a fetch from the bucket changes the mtime).

RETENTION_LONG_COMPONENTS="${RETENTION_LONG_COMPONENTS:-mongodb-audit mysql}"

# awk program shared by gfs_plan and offsite_tiers. Input: paths relative to
# BACKUP_DIR, one per line. Fills files[path] = TS, comp[path] = manifest key
# (`mongodb/<TS>/<label>.*` → label, `redis/<c>_<TS>.*` → redis:<c>, else the
# directory), manifest[TS] for each run manifest, mpath[path] = TS, and
# untimed[path] for a name without `%Y-%m-%d_%H%M%S` timestamp. A PITR
# starting point (`*.pitr[.age]`, ADR-0031) goes to pitr[path] = TS and
# pcomp[path]: it is no dump, it only follows the dump of its run.
_GFS_AWK='
	# Days since 1970-01-01 of TS (proleptic Gregorian, no date(1) needed).
	function civil(t,   y, m, d, era, yoe, mp, doy, doe) {
		y = substr(t, 1, 4) + 0; m = substr(t, 6, 2) + 0; d = substr(t, 9, 2) + 0
		y -= (m <= 2)
		era = int((y >= 0 ? y : y - 399) / 400)
		yoe = y - era * 400
		mp = (m + 9) % 12
		doy = int((153 * mp + 2) / 5) + d - 1
		doe = yoe * 365 + int(yoe / 4) - int(yoe / 100) + doy
		return era * 146097 + doe - 719468
	}
	# 1970-01-01 is a Thursday: +3 puts the week boundaries on Mondays.
	function week(t) { return int((civil(t) + 3) / 7) }
	function month(t) { return (substr(t, 1, 4) + 0) * 12 + substr(t, 6, 2) - 1 }
	function stamp(s) {
		if (match(s, /[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9][0-9][0-9]/))
			return substr(s, RSTART, RLENGTH)
		return ""
	}
	function component(p,   part, c) {
		split(p, part, "/")
		if (part[1] == "mongodb") { c = part[3]; sub(/\..*$/, "", c); return c }
		if (part[1] == "redis") { c = part[2]; sub(/_[0-9][0-9][0-9][0-9]-.*$/, "", c); return "redis:" c }
		return part[1]
	}
	BEGIN { n = split(long, l, " "); for (i = 1; i <= n; i++) islong[l[i]] = 1 }
	NF {
		t = stamp($0)
		if (t == "") untimed[$0] = 1
		else if ($0 ~ /^manifests\//) { manifest[t] = 1; mpath[$0] = t }
		else if ($0 ~ /\.pitr(\.age)?$/) { pitr[$0] = t; pcomp[$0] = component($0) }
		else { files[$0] = t; comp[$0] = component($0) }
	}
'

# gfs_plan <now TS> <daily days> <weekly weeks> <monthly months> <long components>
# Reads on stdin the paths (relative to BACKUP_DIR) of the backup files and
# run manifests and prints what the retention policy drops: `D <path>` for a
# timestamped file to delete, `U <path>` for a file without timestamp in its
# name (left to the caller, which falls back to its mtime). A dump is kept
# when it is at most <daily days> old, when it is the newest complete run of
# its component (or, for a component without any complete run, its newest
# file), or when it is a complete run of a long component that is the first
# of its ISO week (month) and that week (month) is one of the last <weekly
# weeks> (<monthly months>), the current one included. A manifest is kept
# while one of its dumps is, and at least as long as the daily tier; a PITR
# starting point (`.pitr`) while the dump of its component and run is.
gfs_plan() {
	awk -v now="$1" -v daily="$2" -v weeks="$3" -v months="$4" -v long="$5" "$_GFS_AWK"'
		END {
			today = civil(now); thisweek = week(now); thismonth = month(now)
			for (f in files) {
				t = files[f]; c = comp[f]
				if (!(c in newest) || t > newest[c]) newest[c] = t
				if (!(t in manifest)) continue
				if (!(c in done) || t > done[c]) done[c] = t
				if (!(c in islong)) continue
				k = c SUBSEP week(t); if (!(k in firstw) || t < firstw[k]) firstw[k] = t
				k = c SUBSEP month(t); if (!(k in firstm) || t < firstm[k]) firstm[k] = t
			}
			for (f in files) {
				t = files[f]; c = comp[f]; keep = 0
				if (today - civil(t) <= daily) keep = 1
				else if (t == ((c in done) ? done[c] : newest[c])) keep = 1
				else if ((t in manifest) && (c in islong)) {
					if (t == firstw[c SUBSEP week(t)] && thisweek - week(t) < weeks) keep = 1
					if (t == firstm[c SUBSEP month(t)] && thismonth - month(t) < months) keep = 1
				}
				if (keep) { kept[t] = 1; keptc[c SUBSEP t] = 1 }
				else print "D " f
			}
			for (f in mpath) {
				t = mpath[f]
				if (!(t in kept) && today - civil(t) > daily) print "D " f
			}
			for (f in pitr) {
				t = pitr[f]
				if (!((pcomp[f] SUBSEP t) in keptc) && today - civil(t) > daily) print "D " f
			}
			for (f in untimed) print "U " f
		}
	'
}

# Backup files and manifests on the volume, relative to BACKUP_DIR (no
# metrics, no `.partial`). The binlog and oplog archives (`mysql/binlog/`,
# `mongodb/oplog/`) are left out: backup-incremental-k8s.sh keeps them 72 h
# (prune_incremental, ADR-0031), they are never promoted and never count as
# the newest file of a component.
backup_listing() {
	find "${BACKUP_DIR}" -mindepth 2 -type f -not -path "${BACKUP_DIR}/metrics/*" \
		-not -path "${BACKUP_DIR}/mysql/binlog/*" -not -path "${BACKUP_DIR}/mongodb/oplog/*" \
		-not -name '*.partial' |
		sed "s|^${BACKUP_DIR}/||"
}

# Deletes the backups the retention policy (gfs_plan) drops, and the
# `*.partial` files a killed run (OOM, activeDeadlineSeconds) left behind:
# this run renamed or deleted its own, so any older than an hour is an orphan.
# A MongoDB run directory goes once all its archives are gone. `metrics/` is
# never touched. Off-site copies follow the bucket's lifecycle rules.
prune_old() {
	local weeks="${RETENTION_WEEKLY_WEEKS:-0}" months="${RETENTION_MONTHLY_MONTHS:-0}"
	log "Pruning backups: daily ${RETENTION_DAYS} days, weekly ${weeks} weeks, monthly ${months} months (${RETENTION_LONG_COMPONENTS}); the newest complete run of each component is kept"
	find "${BACKUP_DIR}" -mindepth 2 -type f -name '*.partial' -mmin +60 -delete 2>/dev/null || true
	local plan kind path deleted=0
	if ! plan="$(backup_listing | gfs_plan "$TIMESTAMP" "$RETENTION_DAYS" "$weeks" "$months" "$RETENTION_LONG_COMPONENTS")"; then
		fail "Retention plan failed: nothing pruned"
		return 0
	fi
	while read -r kind path; do
		[ -n "$path" ] || continue
		case "$kind" in
		D) rm -f "${BACKUP_DIR}/${path}" && deleted=$((deleted + 1)) ;;
		# No timestamp in the name: only the mtime tells its age.
		U)
			if [ -n "$(find "${BACKUP_DIR}/${path}" -mtime "+${RETENTION_DAYS}")" ]; then
				rm -f "${BACKUP_DIR}/${path}" && deleted=$((deleted + 1))
			fi
			;;
		esac
	done <<<"$plan"
	find "${BACKUP_DIR}" -mindepth 2 -type d -empty -delete 2>/dev/null || true
	ok "Old backups pruned: ${deleted} file(s) deleted"
}

# offsite_tiers <path>
# Off-site tiers (`daily`, `weekly`, `monthly`, space separated) of file
# <path> (relative to BACKUP_DIR) of this run (TIMESTAMP) in the tiered
# layout. Every file is daily. A dump of a RETENTION_LONG_COMPONENTS component
# of a run with a manifest is also weekly (monthly) when no earlier complete
# run of that component in the same ISO week (month) is on the volume: the
# daily tier keeps those earlier runs, which needs RETENTION_DAYS >= 30 for
# the monthly tier (a shorter one only adds monthly copies). The manifest
# goes to every tier one of the run's dumps goes to. Binlog and oplog
# archives and PITR starting points (`.pitr`) are daily only: a starting
# point is useless without the archives, which live 72 h (ADR-0031).
offsite_tiers() {
	local rel="$1" other tiers="daily"
	case "$rel" in
	mysql/binlog/* | mongodb/oplog/* | *.pitr | *.pitr.age)
		echo daily
		return 0
		;;
	manifests/*)
		for other in "${OUTPUTS[@]}"; do
			case "$other" in manifests/*) continue ;; esac
			tiers="${tiers} $(offsite_tiers "$other")"
		done
		tr ' ' '\n' <<<"$tiers" | awk 'NF && !seen[$0]++' | sort | tr '\n' ' ' | sed 's/ $//'
		echo
		return 0
		;;
	esac
	backup_listing | awk -v now="$TIMESTAMP" -v target="$rel" -v long="$RETENTION_LONG_COMPONENTS" "$_GFS_AWK"'
		END {
			c = component(target); tiers = "daily"
			if ((c in islong) && (now in manifest)) {
				for (f in files) {
					t = files[f]
					if (comp[f] != c || t >= now || !(t in manifest)) continue
					if (week(t) == week(now)) w = 1
					if (month(t) == month(now)) m = 1
				}
				if (!w) tiers = tiers " weekly"
				if (!m) tiers = tiers " monthly"
			}
			print tiers
		}
	'
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

# stdout: PITR metadata of a MySQL dump of server `$1`, whose binlog
# coordinates line (`-- CHANGE REPLICATION SOURCE TO ...`, mysqldump
# --source-data=2) is in file `$2`. Fails when the line holds no well-formed
# coordinates. Bash matches, no sed backreference: the first CI run of #291
# stored a control character in place of a mangled `\1`.
mysql_pitr() {
	local line binlog="" pos=""
	line=$(cat "$2")
	local file_re="_LOG_FILE='([A-Za-z0-9_.-]+[.][0-9]+)'" pos_re="_LOG_POS=([0-9]+)"
	[[ "$line" =~ $file_re ]] && binlog="${BASH_REMATCH[1]}"
	[[ "$line" =~ $pos_re ]] && pos="${BASH_REMATCH[1]}"
	if [ -z "$binlog" ] || [ -z "$pos" ]; then
		fail "The MySQL dump carries no binlog coordinates: no point-in-time restore from it" >&2
		return 1
	fi
	echo "server_uuid=$1"
	echo "binlog_file=${binlog}"
	echo "binlog_pos=${pos}"
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

# --- Chain breaks (backup-incremental-k8s.sh, alert BackupPitrGap) -----------
#
# A binlog purged or an oplog entry overwritten before being archived breaks
# the chain for good: from the dumps taken before the break, no point-in-time
# restore can cross it. The archiving run that finds it fails once, the next
# ones succeed again from after the break; these helpers tell, from the names
# only, whether the break still matters, that is whether the newest daily dump
# was taken before it.

# Stamp of the newest binlog archive of directory `$1` that follows a missing
# binlog (the chain resumed there), empty when the chain is unbroken.
binlog_break() {
	local prev="" index stamp path at=""
	while read -r index stamp path; do
		[ -n "$index" ] || continue
		if [ -n "$prev" ] && [ "$index" -ne $((prev + 1)) ]; then
			at="$stamp"
		fi
		prev="$index"
	done < <(binlog_archives "$1")
	echo "$at"
}

# Unix time (seconds of its `from` point) of the newest oplog archive of
# directory `$1` that does not start at the previous one's end, empty when
# the chain is unbroken.
oplog_break() {
	local prev="" from end path at=""
	while read -r from end path; do
		[ -n "$from" ] || continue
		if [ -n "$prev" ] && [ "$from" != "$prev" ]; then
			at="${from%.*}"
		fi
		prev="$end"
	done < <(oplog_archives "$1")
	echo "$at"
}

# Stamp of the newest daily dump of store `$1` (mysql, mongodb, mongodb-audit)
# that carries a PITR starting point, read from the file names.
newest_pitr_dump() {
	local path
	case "$1" in
	mysql)
		path=$(find "${BACKUP_DIR}/mysql" -maxdepth 1 -type f \( -name 'financial_scraper_*.pitr' -o -name 'financial_scraper_*.pitr.age' \) 2>/dev/null | sort | tail -1)
		path="${path##*/financial_scraper_}"
		echo "${path%%.*}"
		;;
	*)
		path=$(find "${BACKUP_DIR}/mongodb" -mindepth 2 -maxdepth 2 -type f \( -name "$1.pitr" -o -name "$1.pitr.age" \) 2>/dev/null | sort | tail -1)
		[ -n "$path" ] && basename "$(dirname "$path")"
		;;
	esac
	return 0
}

# 0 when the chain of store `$1` (archives in `$2`) is broken after the newest
# daily dump's start: point-in-time restore to an instant after the break is
# impossible until the next daily dump.
pitr_broken() {
	local dump at
	dump=$(newest_pitr_dump "$1")
	case "$1" in
	mysql)
		at=$(binlog_break "$2")
		[ -n "$at" ] || return 1
		[ -z "$dump" ] || [[ "$dump" < "$at" ]]
		;;
	*)
		at=$(oplog_break "$2")
		[ -n "$at" ] || return 1
		[ -z "$dump" ] || [ "$(stamp_epoch "$dump")" -le "$at" ]
		;;
	esac
}
