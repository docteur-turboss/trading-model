#!/usr/bin/env bash
# GFS retention of the backups (scripts/backup-lib.sh, ADR-0032, issue #292):
# 400 days of fake runs (timestamped files + run manifests, some runs failed),
# then checks exactly which files prune_old keeps, with the default policy
# (daily only) and with weekly + monthly tiers, and the off-site tiers
# upload_offsite copies each file to. No age, no bucket: an rclone stub
# records the copies. Needs GNU date (expected sets computed independently).
#   bash tests/backup/backup-retention.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "  ✓ $*"; }
failed() {
	echo "  ✗ $*"
	FAILED=1
}

log() { echo "[test] $*" >&2; }
ok() { log "$*"; }
fail() { log "$*"; }
warn() { log "$*"; }
# shellcheck source=../../scripts/backup-lib.sh
source "$ROOT/scripts/backup-lib.sh"

NOW_DAY="2026-11-03"
NOW="${NOW_DAY}_020000"
DAYS=400
BACKUP_DIR="$WORK/backups"

# Run days, oldest first, with their calendar data from ONE date(1) call
# (independent of gfs_plan's arithmetic): EPOCH (days since 1970-01-01),
# MONDAY (epoch day of the Monday of its ISO week), MONTH (year*12+month-1).
declare -A EPOCH=() MONDAY=() MONTH=()
RUN_DAYS=()
for ((i = DAYS - 1; i >= 0; i--)); do echo "${NOW_DAY} -${i} days"; done >"$WORK/dates"
while read -r d secs dow; do
	RUN_DAYS+=("$d")
	EPOCH[$d]=$((secs / 86400))
	MONDAY[$d]=$((secs / 86400 - dow + 1))
	MONTH[$d]=$((10#${d:0:4} * 12 + 10#${d:5:2} - 1))
done < <(date -u -f "$WORK/dates" +'%Y-%m-%d %s %u')
TODAY="${EPOCH[$NOW_DAY]}"
CHECKPOINTS_STOP="${RUN_DAYS[$((DAYS - 1 - 45))]}"

# Failures of the scenario:
#  - mysql fails on the 1st and the 2nd of every odd month (no file): its
#    monthly backup moves to the 3rd;
#  - every 10th run is killed before its manifest (files, no manifest): never
#    complete, never promoted;
#  - checkpoints stop being backed up 45 days ago: the guard keeps its last
#    complete run.
mysql_failed() {
	local m=$((10#${1:5:2}))
	[ $((m % 2)) -eq 1 ] && { [ "${1:8:2}" = 01 ] || [ "${1:8:2}" = 02 ]; }
}
no_manifest() { [ $((EPOCH[$1] % 10)) -eq 0 ]; }

# Sets P to the relative path of component `$2` for run day `$1`, as
# backup-k8s.sh names it (empty when the dump failed).
component_path() {
	local d="$1" ts="${1}_020000"
	P=""
	case "$2" in
	mongodb | mongodb-audit) P="mongodb/${ts}/${2}.archive.gz.age" ;;
	mysql) mysql_failed "$d" || P="mysql/financial_scraper_${ts}.sql.gz.age" ;;
	checkpoints) [[ "$d" > "$CHECKPOINTS_STOP" ]] || P="checkpoints/checkpoints_${ts}.tar.gz.age" ;;
	spire) P="spire/keys_${ts}.json.age" ;;
	esac
}
COMPONENTS=(mongodb mongodb-audit mysql checkpoints spire)

# Point-in-time recovery files (ADR-0031), written when WITH_PITR=true: a
# `.pitr` starting point next to each MongoDB and MySQL dump, and binlog /
# oplog archives, which backup-incremental-k8s.sh prunes itself (72 h).
WITH_PITR=false
# Sets Q to the `.pitr` file of dump P (empty for the other components).
pitr_path() {
	Q=""
	case "$P" in
	mongodb/*) Q="${P%.archive.gz.age}.pitr.age" ;;
	mysql/*) Q="${P%.sql.gz.age}.pitr.age" ;;
	esac
}
# Archives: an old binlog (its name carries a timestamp, 200 days old), one
# newer than every dump (would become mysql's newest file), oplog slices
# (no timestamp in the name, old mtime).
ARCHIVES="mysql/binlog/uuid-1/binlog.000001_2025-04-17_013000.gz.age
mysql/binlog/uuid-1/binlog.000002_${NOW_DAY}_033000.gz.age
mongodb/oplog/mongodb-audit/1000.1_2000.1.bson.gz.age
mongodb/oplog/mongodb/1000.1_2000.1.bson.gz.age"

build_tree() {
	rm -rf "$BACKUP_DIR"
	mkdir -p "$BACKUP_DIR"/{mongodb,mysql,checkpoints,spire,manifests,metrics}
	local d c
	(cd "$BACKUP_DIR/mongodb" && printf '%s_020000\n' "${RUN_DAYS[@]}" | xargs mkdir -p)
	for d in "${RUN_DAYS[@]}"; do
		for c in "${COMPONENTS[@]}"; do
			component_path "$d" "$c"
			[ -z "$P" ] || echo x >"$BACKUP_DIR/$P"
			if $WITH_PITR && [ -n "$P" ]; then
				pitr_path
				[ -z "$Q" ] || echo x >"$BACKUP_DIR/$Q"
			fi
		done
		no_manifest "$d" || echo '{}' >"$BACKUP_DIR/manifests/manifest_${d}_020000.json.age"
	done
	echo "backup_last_run_timestamp 1" >"$BACKUP_DIR/metrics/backup.prom"
	touch -d '2025-01-01' "$BACKUP_DIR/metrics/backup.prom"
	# A file without timestamp in its name: only its mtime tells its age.
	echo x >"$BACKUP_DIR/spire/old-copy.json.age"
	touch -d "${NOW_DAY} -60 days" "$BACKUP_DIR/spire/old-copy.json.age"
	echo x >"$BACKUP_DIR/spire/recent-copy.json.age"
	if $WITH_PITR; then
		local f
		while read -r f; do
			mkdir -p "$BACKUP_DIR/$(dirname "$f")"
			echo x >"$BACKUP_DIR/$f"
			touch -d "${NOW_DAY} -200 days" "$BACKUP_DIR/$f"
		done <<<"$ARCHIVES"
	fi
	# An orphan .partial of a killed run.
	echo x >"$BACKUP_DIR/mysql/financial_scraper_${NOW_DAY}_010000.sql.gz.age.partial"
	touch -d "${NOW_DAY} -2 days" "$BACKUP_DIR/mysql/financial_scraper_${NOW_DAY}_010000.sql.gz.age.partial"
}

# Expected surviving files for weekly `$1` weeks and monthly `$2` months.
expected() {
	local weeks="$1" months="$2" d c age keep
	local now_monday="${MONDAY[$NOW_DAY]}" now_month="${MONTH[$NOW_DAY]}"
	declare -A firstw=() firstm=() lastdone=() keptday=()
	for d in "${RUN_DAYS[@]}"; do
		no_manifest "$d" && continue
		for c in "${COMPONENTS[@]}"; do
			component_path "$d" "$c"
			[ -n "$P" ] || continue
			lastdone[$c]="$d"
			[ -n "${firstw[$c:${MONDAY[$d]}]:-}" ] || firstw[$c:${MONDAY[$d]}]="$d"
			[ -n "${firstm[$c:${MONTH[$d]}]:-}" ] || firstm[$c:${MONTH[$d]}]="$d"
		done
	done
	for d in "${RUN_DAYS[@]}"; do
		age=$((TODAY - EPOCH[$d]))
		for c in "${COMPONENTS[@]}"; do
			component_path "$d" "$c"
			[ -n "$P" ] || continue
			keep=false
			if [ "$age" -le 30 ] || [ "${lastdone[$c]}" = "$d" ]; then
				keep=true
			elif ! no_manifest "$d" && { [ "$c" = mysql ] || [ "$c" = mongodb-audit ]; }; then
				[ "${firstw[$c:${MONDAY[$d]}]}" = "$d" ] &&
					[ $(((now_monday - MONDAY[$d]) / 7)) -lt "$weeks" ] && keep=true
				[ "${firstm[$c:${MONTH[$d]}]}" = "$d" ] &&
					[ $((now_month - MONTH[$d])) -lt "$months" ] && keep=true
			fi
			if $keep; then
				echo "$P"
				keptday[$d]=1
				if $WITH_PITR; then
					pitr_path
					[ -z "$Q" ] || echo "$Q"
				fi
			fi
		done
		if ! no_manifest "$d" && { [ "$age" -le 30 ] || [ -n "${keptday[$d]:-}" ]; }; then
			echo "manifests/manifest_${d}_020000.json.age"
		fi
	done
	echo "metrics/backup.prom"
	echo "spire/recent-copy.json.age"
	! $WITH_PITR || echo "$ARCHIVES"
}

survivors() {
	find "$BACKUP_DIR" -type f | sed "s|^${BACKUP_DIR}/||" | sort
}

# prune_old with weekly `$1` / monthly `$2` (empty: variables unset), then
# compares the surviving files with expected().
check_prune() {
	local label="$1" weeks="$2" months="$3"
	build_tree
	TIMESTAMP="$NOW" RETENTION_DAYS=30
	if [ -n "$weeks" ]; then
		RETENTION_WEEKLY_WEEKS="$weeks" RETENTION_MONTHLY_MONTHS="$months" prune_old 2>/dev/null
	else
		(unset RETENTION_WEEKLY_WEEKS RETENTION_MONTHLY_MONTHS && prune_old 2>/dev/null)
	fi
	survivors >"$WORK/got"
	expected "${weeks:-0}" "${months:-0}" | sort >"$WORK/want"
	if diff -u "$WORK/want" "$WORK/got" >"$WORK/diff"; then
		pass "${label}: exactly the expected $(wc -l <"$WORK/want" | tr -d ' ') files kept"
	else
		failed "${label}: kept files differ from the policy"
		head -40 "$WORK/diff"
	fi
}

has() { grep -qx "$1" "$WORK/got"; }

echo "default policy (no new variable): 30 days + newest complete run"
check_prune "default" "" ""
has "checkpoints/checkpoints_${CHECKPOINTS_STOP}_020000.tar.gz.age" &&
	pass "the newest complete run of a component is kept beyond 30 days" ||
	failed "the last checkpoints backup (${CHECKPOINTS_STOP}) was deleted"
[ ! -d "$BACKUP_DIR/mongodb/${RUN_DAYS[0]}_020000" ] &&
	pass "MongoDB run directories older than 30 days are removed whole" ||
	failed "mongodb/${RUN_DAYS[0]}_020000 is still there"
has "metrics/backup.prom" && pass "metrics are never pruned" || failed "metrics/backup.prom was deleted"
! has "spire/old-copy.json.age" && has "spire/recent-copy.json.age" &&
	pass "files without timestamp fall back to their mtime" ||
	failed "untimestamped files: wrong fallback"
[ -z "$(find "$BACKUP_DIR" -name '*.partial')" ] && pass "orphan .partial files are deleted" ||
	failed "an orphan .partial survived"
old_mysql="$(grep -c '^mysql/' "$WORK/got" || true)"
[ "$old_mysql" -le 31 ] && pass "no mysql dump older than 30 days (${old_mysql} kept)" ||
	failed "${old_mysql} mysql dumps kept with the default policy"

echo "GFS: 12 weekly, 60 monthly for mongodb-audit and mysql"
check_prune "gfs 12w/60m" 12 60
has "mysql/financial_scraper_2025-11-03_020000.sql.gz.age" &&
	pass "a monthly run (first complete of 2025-11, 365 days old) survives" ||
	failed "the 2025-11 monthly mysql dump was deleted"
! has "mysql/financial_scraper_2026-01-01_020000.sql.gz.age" && ! has "mysql/financial_scraper_2026-01-02_020000.sql.gz.age" &&
	has "mysql/financial_scraper_2026-01-03_020000.sql.gz.age" &&
	pass "a failed run is never promoted: January's monthly is the 3rd" ||
	failed "January 2026 monthly mysql dump: wrong run kept"
! has "mongodb/2026-01-01_020000/mongodb.archive.gz.age" && has "mongodb/2026-01-01_020000/mongodb-audit.archive.gz.age" &&
	pass "only long components are promoted (mongodb-audit kept, mongodb dropped)" ||
	failed "promotion applied to the wrong components"
for d in "${RUN_DAYS[@]}"; do
	if no_manifest "$d" && [ $((TODAY - EPOCH[$d])) -gt 30 ]; then
		if grep -q "_${d}_\|/${d}_" "$WORK/got"; then
			failed "run ${d} (no manifest, older than 30 days) was kept"
		else
			pass "a run without manifest is never promoted (${d})"
		fi
		break
	fi
done

echo "point-in-time files (.pitr, binlog / oplog archives) next to the dumps"
WITH_PITR=true
check_prune "default + pitr" "" ""
has "mysql/binlog/uuid-1/binlog.000001_2025-04-17_013000.gz.age" &&
	has "mongodb/oplog/mongodb-audit/1000.1_2000.1.bson.gz.age" &&
	pass "binlog and oplog archives are left to backup-incremental-k8s.sh, whatever their age" ||
	failed "prune_old deleted a binlog / oplog archive"
! has "mysql/financial_scraper_${RUN_DAYS[0]}_020000.pitr.age" &&
	pass "a .pitr file goes with its dump" || failed "the .pitr of a pruned dump survived"
check_prune "gfs 12w/60m + pitr" 12 60
has "mysql/financial_scraper_2025-11-03_020000.pitr.age" &&
	has "mongodb/2026-01-01_020000/mongodb-audit.pitr.age" && ! has "mongodb/2026-01-01_020000/mongodb.pitr.age" &&
	pass "a .pitr file stays as long as its promoted dump on the volume, and only that one" ||
	failed "a .pitr file does not follow its dump"
build_tree
TIMESTAMP="$NOW"
plan="$(backup_listing | gfs_plan "$NOW" 30 0 0 "$RETENTION_LONG_COMPONENTS")"
! grep -qE '/binlog/|/oplog/' <<<"$plan" && pass "gfs_plan never sees the archives (backup_listing leaves them out)" ||
	failed "gfs_plan listed an archive: $(grep -E '/binlog/|/oplog/' <<<"$plan" | head -2)"
# The newest mysql file of the volume is a binlog archive: without the
# exclusion it would take the guard of a component without complete run.
# Planned in 2027, when every dump is past the daily tier.
rm -f "$BACKUP_DIR"/manifests/*
plan="$(backup_listing | gfs_plan 2027-06-01_020000 30 0 0 "$RETENTION_LONG_COMPONENTS")"
newest_mysql="$(cd "$BACKUP_DIR" && find mysql -maxdepth 1 -name '*.sql.gz.age' | sort | tail -1)"
! grep -qx "D ${newest_mysql}" <<<"$plan" && pass "without any manifest, the newest mysql dump (not a binlog) keeps the guard" ||
	failed "the newest mysql dump ${newest_mysql} would be deleted"
WITH_PITR=false

echo "off-site tiers"
build_tree
TIMESTAMP="$NOW" RETENTION_DAYS=30
OUTPUTS=("mongodb/${NOW}/mongodb-audit.archive.gz.age" "mongodb/${NOW}/mongodb.archive.gz.age"
	"mysql/financial_scraper_${NOW}.sql.gz.age" "manifests/manifest_${NOW}.json.age")
# 2026-11-03 is a Tuesday: Monday 2026-11-02 already holds a complete run
# (unless it has no manifest), the 1st of the month too.
[ "$(offsite_tiers "mongodb/${NOW}/mongodb.archive.gz.age")" = "daily" ] &&
	pass "a short component is daily only" || failed "mongodb got $(offsite_tiers "mongodb/${NOW}/mongodb.archive.gz.age")"
want_audit="daily"
no_manifest 2026-11-02 && ! no_manifest 2026-11-03 && want_audit="daily weekly"
got="$(offsite_tiers "mongodb/${NOW}/mongodb-audit.archive.gz.age")"
[ "$got" = "$want_audit" ] && pass "mid-week, mid-month run of a long component: ${got}" ||
	failed "mongodb-audit tiers: '${got}', expected '${want_audit}'"
# A run on the first day of a new month and week: 2026-12-01 is a Tuesday,
# so make it the first run of its ISO week by removing Monday 2026-11-30.
TIMESTAMP="2026-12-01_020000"
mkdir -p "$BACKUP_DIR/mongodb/${TIMESTAMP}"
echo x >"$BACKUP_DIR/mysql/financial_scraper_${TIMESTAMP}.sql.gz.age"
echo x >"$BACKUP_DIR/spire/keys_${TIMESTAMP}.json.age"
echo '{}' >"$BACKUP_DIR/manifests/manifest_${TIMESTAMP}.json.age"
got="$(offsite_tiers "mysql/financial_scraper_${TIMESTAMP}.sql.gz.age")"
[ "$got" = "daily weekly monthly" ] && pass "first complete run of a month and week: ${got}" ||
	failed "first run of December: '${got}'"
for f in "mysql/financial_scraper_${TIMESTAMP}.pitr.age" "mongodb/${TIMESTAMP}/mongodb-audit.pitr.age" \
	"mysql/binlog/uuid-1/binlog.000009_${TIMESTAMP}.gz.age" "mongodb/oplog/mongodb-audit/1.1_2.1.bson.gz.age"; do
	got="$(offsite_tiers "$f")"
	[ "$got" = daily ] || failed "${f}: '${got}', expected daily only"
done
pass "PITR starting points and archives are daily only off-site (useless without the 72 h archives)"
OUTPUTS=("mysql/financial_scraper_${TIMESTAMP}.sql.gz.age" "mysql/financial_scraper_${TIMESTAMP}.pitr.age" "spire/keys_${TIMESTAMP}.json.age" "manifests/manifest_${TIMESTAMP}.json.age")
got="$(offsite_tiers "manifests/manifest_${TIMESTAMP}.json.age")"
[ "$got" = "daily monthly weekly" ] && pass "the manifest follows its dumps to every tier" ||
	failed "manifest tiers: '${got}'"
rm "$BACKUP_DIR/manifests/manifest_${TIMESTAMP}.json.age"
got="$(offsite_tiers "mysql/financial_scraper_${TIMESTAMP}.sql.gz.age")"
[ "$got" = "daily" ] && pass "a run without manifest is daily only off-site" || failed "no manifest: '${got}'"
echo '{}' >"$BACKUP_DIR/manifests/manifest_${TIMESTAMP}.json.age"

echo "upload_offsite, tiered layout (rclone stub)"
mkdir -p "$WORK/bin"
cat >"$WORK/bin/rclone" <<'STUB'
#!/usr/bin/env bash
list="" dest="${@: -1}"
while [ $# -gt 0 ]; do
	[ "$1" = "--files-from" ] && list="$2"
	shift
done
while read -r f; do echo "${dest} ${f}"; done <"$list" >>"$RCLONE_LOG"
STUB
chmod +x "$WORK/bin/rclone"
export RCLONE_LOG="$WORK/rclone.log"
: >"$RCLONE_LOG"
PATH="$WORK/bin:$PATH" AGE_SUFFIX=".age" BACKUP_S3_BUCKET="s3://bucket/prod" BACKUP_OFFSITE_LAYOUT=tiered METRICS_FILE="" \
	upload_offsite 2>/dev/null
sort "$RCLONE_LOG" >"$WORK/copies"
cat >"$WORK/want-copies" <<EOF
:s3:bucket/prod/daily manifests/manifest_${TIMESTAMP}.json.age
:s3:bucket/prod/daily mysql/financial_scraper_${TIMESTAMP}.pitr.age
:s3:bucket/prod/daily mysql/financial_scraper_${TIMESTAMP}.sql.gz.age
:s3:bucket/prod/daily spire/keys_${TIMESTAMP}.json.age
:s3:bucket/prod/monthly manifests/manifest_${TIMESTAMP}.json.age
:s3:bucket/prod/monthly mysql/financial_scraper_${TIMESTAMP}.sql.gz.age
:s3:bucket/prod/weekly manifests/manifest_${TIMESTAMP}.json.age
:s3:bucket/prod/weekly mysql/financial_scraper_${TIMESTAMP}.sql.gz.age
EOF
diff -u "$WORK/want-copies" "$WORK/copies" && pass "each file is copied under daily/ and its promoted tiers" ||
	failed "tiered off-site copies differ"
: >"$RCLONE_LOG"
PATH="$WORK/bin:$PATH" AGE_SUFFIX=".age" BACKUP_S3_BUCKET="s3://bucket/prod" METRICS_FILE="" \
	upload_offsite 2>/dev/null
[ "$(cut -d' ' -f1 "$RCLONE_LOG" | sort -u)" = ":s3:bucket/prod" ] && [ "$(wc -l <"$RCLONE_LOG")" -eq 4 ] &&
	pass "default layout unchanged: flat copy at the bucket root" || failed "flat layout: $(cat "$RCLONE_LOG")"

echo ""
if [ "$FAILED" -ne 0 ]; then
	echo "FAILED"
	exit 1
fi
echo "All retention tests passed"
