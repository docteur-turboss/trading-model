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
	# flat.list: copied to the bucket root, the layout before ADR-0031.
	flat) printf '%s
' "${OUTPUTS[@]}" >"$work/flat.list" ;;
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
			# `:s3:` is an on-the-fly remote: credentials from AWS_*, endpoint and
			# provider from RCLONE_S3_*. Paths keep their timestamped names.
			RCLONE_S3_ENV_AUTH=true rclone copy --s3-no-check-bucket 				--files-from "$list" "$BACKUP_DIR" ":s3:${dest#s3://}" || copied=false
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

# --- Retention: grandfather-father-son (ADR-0031) ----------------------------
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
# untimed[path] for a name without `%Y-%m-%d_%H%M%S` timestamp.
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
# while one of its dumps is, and at least as long as the daily tier.
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
				if (keep) kept[t] = 1
				else print "D " f
			}
			for (f in mpath) {
				t = mpath[f]
				if (!(t in kept) && today - civil(t) > daily) print "D " f
			}
			for (f in untimed) print "U " f
		}
	'
}

# Backup files and manifests on the volume, relative to BACKUP_DIR (no
# metrics, no `.partial`).
backup_listing() {
	find "${BACKUP_DIR}" -mindepth 2 -type f -not -path "${BACKUP_DIR}/metrics/*" -not -name '*.partial' |
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
# goes to every tier one of the run's dumps goes to.
offsite_tiers() {
	local rel="$1" other tiers="daily"
	case "$rel" in
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
