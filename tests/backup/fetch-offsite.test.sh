#!/usr/bin/env bash
# scripts/fetch-offsite.sh against a real S3 API: `rclone serve s3` on a
# temporary directory, filled by upload_offsite (backup-lib.sh) the way the
# db-backup CronJob fills the bucket. Covers run selection, the layout read by
# restore-k8s.sh and the refusals. Needs bash, age and rclone >= 1.65 (serve
# s3); backup-test.yml runs it in the backup-tools image:
#   docker build -t backup-tools deploy/backup
#   docker run --rm -v "$PWD:/repo:ro" -w /repo backup-tools bash tests/backup/fetch-offsite.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
FETCH="$ROOT/scripts/fetch-offsite.sh"
WORK="$(mktemp -d)"
SERVER_PID=""
cleanup() {
	[ -z "$SERVER_PID" ] || kill "$SERVER_PID" 2>/dev/null || true
	rm -rf "$WORK"
}
trap cleanup EXIT
FAILED=0

# shellcheck source=test-lib.sh
source "$ROOT/tests/backup/test-lib.sh"
# shellcheck source=../../scripts/backup-lib.sh
source "$ROOT/scripts/backup-lib.sh"

# --- S3 store ----------------------------------------------------------------
PORT=$((20000 + RANDOM % 20000))
mkdir -p "$WORK/s3/backups"
rclone serve s3 --addr "127.0.0.1:${PORT}" --auth-key test,test-secret-key "$WORK/s3" >"$WORK/s3.log" 2>&1 &
SERVER_PID=$!
export AWS_ACCESS_KEY_ID=test AWS_SECRET_ACCESS_KEY=test-secret-key AWS_REGION=us-east-1
export RCLONE_S3_ENDPOINT="http://127.0.0.1:${PORT}" RCLONE_S3_PROVIDER=Other
export BACKUP_S3_BUCKET=s3://backups/staging
for _ in $(seq 50); do
	RCLONE_S3_ENV_AUTH=true rclone lsd :s3: >/dev/null 2>&1 && break
	sleep 0.2
done
RCLONE_S3_ENV_AUTH=true rclone lsd :s3: >/dev/null 2>&1 || {
	cat "$WORK/s3.log"
	echo "rclone serve s3 did not start"
	exit 1
}

# --- Backup runs, uploaded with upload_offsite -------------------------------
age-keygen -o "$WORK/key.txt" 2>/dev/null
BACKUP_AGE_RECIPIENTS="$(sed -n 's/^# public key: //p' "$WORK/key.txt")" init_encryption
METRICS_FILE=""

# Writes the plaintext `$1`.
plain() {
	printf '%s\n' "$1"
}

# Writes and uploads run `$1` with the components `$2` (comma separated), the
# way backup-k8s.sh does (write_dump, then write_manifest). `$3`: `nomanifest`
# for a run taken before manifests (or whose manifest was not written).
backup_run() {
	local ts="$1" part label
	BACKUP_DIR="$WORK/local/$ts"
	TIMESTAMP="$ts"
	OUTPUTS=()
	MANIFEST_ENTRIES=()
	IFS=',' read -ra parts <<<"$2"
	for part in "${parts[@]}"; do
		case "$part" in
		mongodb)
			mkdir -p "$BACKUP_DIR/mongodb/$ts"
			for label in mongodb mongodb-audit; do
				write_dump "$label" "$BACKUP_DIR/mongodb/$ts/$label.archive.gz.age" plain "$label $ts"
			done
			;;
		mongodb-only)
			mkdir -p "$BACKUP_DIR/mongodb/$ts"
			write_dump mongodb "$BACKUP_DIR/mongodb/$ts/mongodb.archive.gz.age" plain "mongodb $ts"
			;;
		mysql)
			mkdir -p "$BACKUP_DIR/mysql"
			write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_$ts.sql.gz.age" plain "mysql $ts"
			;;
		checkpoints)
			mkdir -p "$BACKUP_DIR/checkpoints"
			write_dump checkpoints "$BACKUP_DIR/checkpoints/checkpoints_$ts.tar.gz.age" plain "checkpoints $ts"
			;;
		pitr)
			# PITR starting points (backup-k8s.sh, ADR-0031).
			mkdir -p "$BACKUP_DIR/mongodb/$ts" "$BACKUP_DIR/mysql"
			for label in mongodb mongodb-audit; do
				echo "oplog_ts=1.1" | seal >"$BACKUP_DIR/mongodb/$ts/$label.pitr.age"
				record_output "$BACKUP_DIR/mongodb/$ts/$label.pitr.age"
			done
			echo "binlog_file=binlog.000002" | seal >"$BACKUP_DIR/mysql/financial_scraper_$ts.pitr.age"
			record_output "$BACKUP_DIR/mysql/financial_scraper_$ts.pitr.age"
			;;
		spire)
			mkdir -p "$BACKUP_DIR/spire"
			write_dump spire "$BACKUP_DIR/spire/keys_$ts.json.age" plain "{\"keys\": \"$ts\"}"
			;;
		esac
	done
	BACKUP_FAILURES=0
	[ "${3:-}" = nomanifest ] || write_manifest 2>/dev/null
	upload_offsite 2>/dev/null
	[ "$BACKUP_FAILURES" -eq 0 ] || {
		echo "upload_offsite failed for run $ts"
		exit 1
	}
}

# Taken before run manifests: only fetched with --timestamp.
OLD=2026-10-30_020000
GOOD=2026-10-31_020000
# The mongodb-audit dump failed: upload_offsite never received it.
BROKEN=2026-11-01_020000
# Every dump, but no run manifest: restore-k8s.sh could not check it.
NOMANIFEST=2026-11-02_020000
backup_run "$OLD" mongodb,mysql,checkpoints,spire nomanifest
backup_run "$GOOD" mongodb,mysql,checkpoints,spire,pitr
backup_run "$BROKEN" mongodb-only,mysql,checkpoints,spire
backup_run "$NOMANIFEST" mongodb,mysql,checkpoints,spire nomanifest
# Binlog and oplog archives (backup-incremental-k8s.sh): one before GOOD
# (never needed by it), two after.
GOOD_EPOCH="$(stamp_epoch "$GOOD")"
BACKUP_DIR="$WORK/local/archives"
OUTPUTS=()
ARCHIVES_BEFORE="mysql/binlog/uuid-1/binlog.000001_2026-10-30_230000.gz.age
mongodb/oplog/mongodb/$((GOOD_EPOCH - 7200)).1_$((GOOD_EPOCH - 3600)).4.bson.gz.age"
ARCHIVES_AFTER="mongodb/oplog/mongodb-audit/$((GOOD_EPOCH - 60)).1_$((GOOD_EPOCH + 3600)).2.bson.gz.age
mongodb/oplog/mongodb/$((GOOD_EPOCH - 3600)).4_$((GOOD_EPOCH + 3600)).1.bson.gz.age
mysql/binlog/uuid-1/binlog.000002_${GOOD}.gz.age
mysql/binlog/uuid-1/binlog.000003_2026-10-31_030000.gz.age"
while read -r file; do
	mkdir -p "$BACKUP_DIR/$(dirname "$file")"
	echo "$file" | seal >"$BACKUP_DIR/$file"
	record_output "$BACKUP_DIR/$file"
done <<<"$ARCHIVES_BEFORE
$ARCHIVES_AFTER"
BACKUP_FAILURES=0
upload_offsite 2>/dev/null
# A stray plaintext file in the bucket is never fetched.
echo "plaintext" >"$WORK/s3/backups/staging/mysql/financial_scraper_${BROKEN}.sql"

# Runs fetch-offsite.sh with `$@`, output in $WORK/out.
fetch() {
	bash "$FETCH" "$@" >"$WORK/out" 2>&1
}

echo "latest complete run"
DEST="$WORK/fetched-latest"
if fetch --dest "$DEST"; then
	pass "exit 0"
else
	failed "fetch of the latest run failed: $(cat "$WORK/out")"
fi
expected="checkpoints/checkpoints_${GOOD}.tar.gz.age
manifests/manifest_${GOOD}.json.age
mongodb/${GOOD}/mongodb-audit.archive.gz.age
mongodb/${GOOD}/mongodb.archive.gz.age
mysql/financial_scraper_${GOOD}.sql.gz.age
spire/keys_${GOOD}.json.age"
actual="$(cd "$DEST" 2>/dev/null && find . -type f | sed 's|^\./||' | sort)"
if [ "$actual" = "$expected" ]; then
	pass "the newest complete run (${GOOD}) and its manifest are fetched, not ${BROKEN} (a dump missing) nor ${NOMANIFEST} (no manifest)"
else
	failed "fetched files: $actual"
fi
same=true
while read -r file; do
	cmp -s "$DEST/$file" "$WORK/local/$GOOD/$file" || same=false
done <<<"$expected"
$same && pass "fetched files are byte-identical to the uploaded ones" || failed "fetched files differ from the uploads"
if gunzip -t <"$DEST/mysql/financial_scraper_${GOOD}.sql.gz.age" 2>/dev/null; then
	failed "a fetched file is readable without the key"
else
	pass "fetched files stay encrypted (nothing decrypted, no plaintext written)"
fi
# restore-k8s.sh lookups (backup-lib.sh): run manifest, then size and sha256.
restore_lookup() {
	(
		export BACKUP_AGE_IDENTITY="$WORK/key.txt"
		BACKUP_DIR="$1" RESTORE_TIMESTAMP="$2"
		resolve_and_verify "$3" "" >/dev/null 2>&1 && echo "$RESOLVED_FILE"
	)
}
layout=true
for key in mongodb mongodb-audit mysql checkpoints spire; do
	for ts in latest "$GOOD"; do
		resolved="$(restore_lookup "$DEST" "$ts" "$key")" || resolved=""
		case "$resolved" in
		"$DEST"/*"$GOOD"*) ;;
		*) layout=false ;;
		esac
	done
done
if $layout; then
	pass "restore-k8s.sh finds every component of ${GOOD} through its manifest, checksums verified"
else
	failed "restore-k8s.sh lookups do not find the fetched run"
fi
grep -q "restore-k8s.sh --timestamp ${GOOD}" "$WORK/out" && pass "prints the restore command" || failed "no restore command in: $(cat "$WORK/out")"

echo "--timestamp"
if fetch --dest "$WORK/fetched-old" --timestamp "$OLD" &&
	[ "$(find "$WORK/fetched-old" -type f | grep -c "$OLD")" = 5 ] &&
	[ "$(find "$WORK/fetched-old" -type f | wc -l)" = 5 ] && grep -q "no run manifest" "$WORK/out"; then
	pass "fetches the requested run ${OLD} only, taken before manifests (with a warning)"
else
	failed "--timestamp ${OLD}: $(cat "$WORK/out")"
fi
if fetch --dest "$WORK/fetched-broken" --timestamp "$BROKEN"; then
	failed "an incomplete run was fetched"
elif grep -q "incomplete" "$WORK/out" && grep -q "mongodb-audit.archive.gz.age" "$WORK/out" && [ ! -e "$WORK/fetched-broken" ]; then
	pass "exit 1 on an incomplete run, naming the missing file, nothing copied"
else
	failed "incomplete run refusal: $(cat "$WORK/out")"
fi
if fetch --dest "$WORK/fetched-none" --timestamp 2020-01-01_000000; then
	failed "a missing run was fetched"
else
	grep -q "No run 2020-01-01_000000" "$WORK/out" && pass "exit 1 on a run absent from the bucket" || failed "missing run message: $(cat "$WORK/out")"
fi
if fetch --dest "$WORK/fetched-bad" --timestamp latest; then
	failed "a malformed timestamp was accepted"
else
	pass "exit 1 on a malformed timestamp"
fi

echo "--components"
if fetch --dest "$WORK/fetched-mysql" --components mysql,spire &&
	[ "$(cd "$WORK/fetched-mysql" && find . -type f | sed 's|^\./||' | sort)" = "manifests/manifest_${BROKEN}.json.age
mysql/financial_scraper_${BROKEN}.sql.gz.age
spire/keys_${BROKEN}.json.age" ]; then
	pass "a run complete for the requested components is enough (${BROKEN} for mysql,spire)"
else
	failed "--components mysql,spire: $(cat "$WORK/out")"
fi
if fetch --dest "$WORK/fetched-unknown" --components mysql,postgres; then
	failed "an unknown component was accepted"
else
	pass "exit 1 on an unknown component"
fi

echo "--pitr"
if fetch --dest "$WORK/fetched-pitr" --pitr --timestamp "$OLD"; then
	failed "a run without PITR starting points was fetched with --pitr"
elif grep -q "financial_scraper_${OLD}.pitr.age" "$WORK/out"; then
	pass "exit 1 with --pitr on a run without starting points (taken before ADR-0031)"
else
	failed "--pitr on ${OLD}: $(cat "$WORK/out")"
fi
expected="$(printf '%s\n' "checkpoints/checkpoints_${GOOD}.tar.gz.age" \
	"mongodb/${GOOD}/mongodb-audit.archive.gz.age" "mongodb/${GOOD}/mongodb-audit.pitr.age" \
	"mongodb/${GOOD}/mongodb.archive.gz.age" "mongodb/${GOOD}/mongodb.pitr.age" \
	"manifests/manifest_${GOOD}.json.age" \
	"mysql/financial_scraper_${GOOD}.pitr.age" "mysql/financial_scraper_${GOOD}.sql.gz.age" \
	"spire/keys_${GOOD}.json.age"; echo "$ARCHIVES_AFTER")"
expected="$(sort <<<"$expected" | grep .)"
if fetch --dest "$WORK/fetched-pitr" --pitr &&
	[ "$(cd "$WORK/fetched-pitr" && find . -type f | sed 's|^\./||' | sort)" = "$expected" ] &&
	grep -q "restore-k8s.sh --until" "$WORK/out"; then
	pass "the run, its starting points and only the archives that can follow it (${GOOD}) are fetched"
else
	failed "--pitr: $(cd "$WORK/fetched-pitr" 2>/dev/null && find . -type f | sort) $(cat "$WORK/out")"
fi
if fetch --dest "$WORK/fetched-pitr-mysql" --pitr --components mysql &&
	[ "$(cd "$WORK/fetched-pitr-mysql" && find . -type f | sed 's|^\./||' | sort)" = "$(printf '%s\n' \
		"manifests/manifest_${GOOD}.json.age" \
		"mysql/binlog/uuid-1/binlog.000002_${GOOD}.gz.age" "mysql/binlog/uuid-1/binlog.000003_2026-10-31_030000.gz.age" \
		"mysql/financial_scraper_${GOOD}.pitr.age" "mysql/financial_scraper_${GOOD}.sql.gz.age")" ]; then
	pass "--pitr --components mysql leaves the oplog archives out"
else
	failed "--pitr --components mysql: $(cat "$WORK/out")"
fi

echo "--dry-run"
if fetch --dest "$WORK/fetched-dry" --dry-run && [ ! -e "$WORK/fetched-dry" ] &&
	[ "$(grep -c "Would fetch" "$WORK/out")" = 6 ] && grep -q "$GOOD" "$WORK/out"; then
	pass "lists the 6 files of ${GOOD} (manifest included) and copies nothing"
else
	failed "--dry-run: $(cat "$WORK/out")"
fi

echo "--tier (BACKUP_OFFSITE_LAYOUT=tiered)"
TIERED=2026-11-02_030000
TIERED_EPOCH="$(stamp_epoch "$TIERED")"
BACKUP_S3_BUCKET=s3://backups/tiered BACKUP_OFFSITE_LAYOUT=tiered backup_run "$TIERED" mongodb,mysql,checkpoints,spire,pitr
# The incremental job (backup-incremental-cronjob.yaml) uploads tiered too:
# its archives go under daily/ only, next to the dumps and .pitr files.
BACKUP_DIR="$WORK/local/tiered-archives"
OUTPUTS=()
TIERED_ARCHIVES="mysql/binlog/uuid-2/binlog.000010_${TIERED}.gz.age
mongodb/oplog/mongodb-audit/$((TIERED_EPOCH - 60)).1_$((TIERED_EPOCH + 3600)).1.bson.gz.age
mongodb/oplog/mongodb/$((TIERED_EPOCH - 60)).1_$((TIERED_EPOCH + 3600)).1.bson.gz.age"
while read -r file; do
	mkdir -p "$BACKUP_DIR/$(dirname "$file")"
	echo "$file" | seal >"$BACKUP_DIR/$file"
	record_output "$BACKUP_DIR/$file"
done <<<"$TIERED_ARCHIVES"
BACKUP_FAILURES=0
BACKUP_S3_BUCKET=s3://backups/tiered BACKUP_OFFSITE_LAYOUT=tiered upload_offsite 2>/dev/null
long_tiers="$(cd "$WORK/s3/backups/tiered" && find weekly monthly -type f | sort)"
if [ "$BACKUP_FAILURES" -eq 0 ] && ! grep -qE '\.pitr\.age$|/binlog/|/oplog/' <<<"$long_tiers" &&
	[ "$(grep -c . <<<"$long_tiers")" = 6 ]; then
	pass "weekly/ and monthly/ hold the audit dump, the MySQL dump and the manifest only: no .pitr, no binlog / oplog archive"
else
	failed "long tiers hold: $long_tiers"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-tiered" &&
	[ "$(find "$WORK/fetched-tiered" -type f | grep -c "$TIERED")" = 6 ] &&
	[ -f "$WORK/fetched-tiered/mysql/financial_scraper_${TIERED}.sql.gz.age" ]; then
	pass "a tiered bucket is read from daily/ by default, in the layout restore-k8s.sh reads"
else
	failed "tiered bucket: $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-tiered-pitr" --pitr &&
	[ "$(cd "$WORK/fetched-tiered-pitr" && find . -type f -path './*/binlog/*' -o -type f -path './*/oplog/*' | sed 's|^\./||' | sort)" = "$(sort <<<"$TIERED_ARCHIVES")" ] &&
	[ "$(find "$WORK/fetched-tiered-pitr" -type f -name '*.pitr.age' | wc -l | tr -d ' ')" = 3 ]; then
	pass "--pitr on a tiered bucket fetches the run, its starting points and the archives, all from daily/"
else
	failed "--pitr on a tiered bucket: $(cd "$WORK/fetched-tiered-pitr" 2>/dev/null && find . -type f | sort) $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-monthly" --tier monthly --components mysql &&
	[ "$(cd "$WORK/fetched-monthly" && find . -type f | sed 's|^\./||' | sort)" = "manifests/manifest_${TIERED}.json.age
mysql/financial_scraper_${TIERED}.sql.gz.age" ]; then
	pass "--tier monthly --components mysql fetches the monthly MySQL dump and its manifest"
else
	failed "--tier monthly: $(cat "$WORK/out")"
fi
AUDIT_DIR="$WORK/fetched-monthly-audit"
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$AUDIT_DIR" --tier monthly --components mongodb-audit &&
	[ "$(cd "$AUDIT_DIR" && find . -type f | sed 's|^\./||' | sort)" = "manifests/manifest_${TIERED}.json.age
mongodb/${TIERED}/mongodb-audit.archive.gz.age" ] &&
	grep -q "restore-k8s.sh --timestamp ${TIERED} --components mongodb-audit" "$WORK/out"; then
	pass "--tier monthly --components mongodb-audit fetches the audit trail alone, with its manifest"
else
	failed "--tier monthly --components mongodb-audit: $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-weekly-long" --tier weekly --components mongodb-audit,mysql &&
	[ "$(find "$WORK/fetched-weekly-long" -type f | wc -l | tr -d ' ')" = 3 ]; then
	pass "--tier weekly --components mongodb-audit,mysql fetches both long-term dumps"
else
	failed "--tier weekly --components mongodb-audit,mysql: $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-monthly-mongodb" --tier monthly --components mongodb; then
	failed "the monthly tier gave the operational MongoDB, which is never promoted"
else
	grep -q "mongodb.archive.gz.age" "$WORK/out" && pass "exit 1 for --components mongodb on the monthly tier (the operational dump is never promoted)" ||
		failed "monthly mongodb refusal: $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-monthly-all" --tier monthly; then
	failed "the monthly tier gave a complete run for every component"
else
	grep -q "try --components mongodb-audit,mysql" "$WORK/out" && pass "exit 1 on the monthly tier for every component, suggesting --components mongodb-audit,mysql" || failed "monthly tier refusal: $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET=s3://backups/tiered fetch --dest "$WORK/fetched-monthly-pitr" --tier monthly --components mysql --pitr; then
	failed "--pitr was accepted on the monthly tier, which holds no starting point"
else
	pass "exit 1 with --pitr on the monthly tier (no .pitr there)"
fi
if fetch --dest "$WORK/fetched-badtier" --tier yearly; then
	failed "an unknown tier was accepted"
else
	pass "exit 1 on an unknown tier"
fi

echo "restore-k8s.sh: the audit trail alone, from the monthly tier"
# kubectl is a stub that records the commands it gets (as in pitr-chain.test.sh).
STUB="$WORK/bin"
mkdir -p "$STUB"
cat >"$STUB/kubectl" <<'STUB_EOF'
#!/usr/bin/env bash
echo "$*" >>"$KUBECTL_LOG"
case " $* " in *" -i "*) cat >/dev/null ;; esac
case "$*" in
*"get pods"*) echo "mongo-0" ;;
*isWritablePrimary*) echo "true" ;;
esac
exit 0
STUB_EOF
chmod +x "$STUB/kubectl"
export KUBECTL_LOG="$WORK/kubectl.log"
: >"$KUBECTL_LOG"
if PATH="$STUB:$PATH" BACKUP_DIR="$AUDIT_DIR" BACKUP_AGE_IDENTITY="$WORK/key.txt" \
	bash "$ROOT/scripts/restore-k8s.sh" --timestamp "$TIERED" --components mongodb-audit >"$WORK/out" 2>&1 &&
	[ "$(grep -c 'mongorestore --quiet --gzip --archive --drop --oplogReplay' "$KUBECTL_LOG")" -eq 1 ] &&
	grep -q "MongoDB restore complete: mongodb-audit" "$WORK/out" && grep -q "Checksum verified" "$WORK/out" &&
	! grep -q "Starting MongoDB restore (mongodb " "$WORK/out"; then
	pass "--components mongodb-audit restores the monthly audit dump alone (checksum verified, exit 0)"
else
	failed "restore of the monthly audit dump: $(tail -8 "$WORK/out")"
fi
: >"$KUBECTL_LOG"
if PATH="$STUB:$PATH" BACKUP_DIR="$AUDIT_DIR" BACKUP_AGE_IDENTITY="$WORK/key.txt" \
	bash "$ROOT/scripts/restore-k8s.sh" --timestamp "$TIERED" --components mongodb >"$WORK/out" 2>&1; then
	failed "--components mongodb succeeded without the operational dump"
elif ! grep -q mongorestore "$KUBECTL_LOG"; then
	pass "--components mongodb on the audit-only run is refused before any write (operational dump missing)"
else
	failed "--components mongodb restored something: $(grep mongorestore "$KUBECTL_LOG" | head -1)"
fi
unset KUBECTL_LOG
echo "off-site catch-up of the incremental archives"
# backup-incremental-k8s.sh: run N cannot reach the store, run N+1 can. Run
# N+1 must send N's archive too (record_incremental_archives), or the chain
# off-site keeps a hole the next alert-free hour hides.
BACKUP_DIR="$WORK/local/catchup"
CATCHUP=s3://backups/catchup
mkdir -p "$BACKUP_DIR/mysql/binlog/uuid-9" "$BACKUP_DIR/mongodb/oplog/mongodb-audit"
OUTPUTS=()
for file in mysql/binlog/uuid-9/binlog.000001_2026-11-01_013000.gz.age mongodb/oplog/mongodb-audit/1000.1_2000.1.bson.gz.age; do
	echo "$file" | seal >"$BACKUP_DIR/$file"
	record_output "$BACKUP_DIR/$file"
done
BACKUP_FAILURES=0
BACKUP_S3_BUCKET="$CATCHUP" RCLONE_S3_ENDPOINT="http://127.0.0.1:1" RCLONE_LOW_LEVEL_RETRIES=1 RCLONE_RETRIES=1 RCLONE_CONTIMEOUT=2s \
	upload_offsite >/dev/null 2>&1
if [ "$BACKUP_FAILURES" -gt 0 ] && [ ! -e "$WORK/s3/backups/catchup" ]; then
	pass "run N: the store is unreachable, the copy fails (offsite 0), nothing off-site"
else
	failed "run N: the failed copy was not reported or something reached the store"
fi
OUTPUTS=()
for file in mysql/binlog/uuid-9/binlog.000002_2026-11-01_023000.gz.age mongodb/oplog/mongodb-audit/2000.1_3000.1.bson.gz.age; do
	echo "$file" | seal >"$BACKUP_DIR/$file"
	record_output "$BACKUP_DIR/$file"
done
record_incremental_archives
BACKUP_FAILURES=0
BACKUP_S3_BUCKET="$CATCHUP" upload_offsite >/dev/null 2>&1
if [ "$BACKUP_FAILURES" -eq 0 ] &&
	[ "$(cd "$WORK/s3/backups/catchup" 2>/dev/null && find . -type f | sed 's|^\./||' | sort)" = "$(cd "$BACKUP_DIR" && find . -type f | sed 's|^\./||' | sort)" ]; then
	pass "run N+1 copies its own archives and run N's: the off-site chain is complete"
else
	failed "run N+1: off-site holds $(cd "$WORK/s3/backups/catchup" 2>/dev/null && find . -type f | sort)"
fi
mkdir -p "$WORK/catchup-fetched"
RCLONE_S3_ENV_AUTH=true rclone copy "$(offsite_remote "$CATCHUP")" "$WORK/catchup-fetched" 2>/dev/null
if binlog_chain "$WORK/catchup-fetched/mysql/binlog/uuid-9" binlog.000001 2026-11-01_020000 >/dev/null 2>&1 &&
	oplog_chain "$WORK/catchup-fetched/mongodb/oplog/mongodb-audit" 1500.1 2500 >/dev/null 2>&1; then
	pass "the chains fetched back from off-site reach across run N"
else
	failed "the chains fetched back from off-site have a gap"
fi
BACKUP_DIR="$WORK/local/archives"

echo "refusals"
if fetch --dest "$DEST"; then
	failed "fetched into a directory that already holds a run"
else
	grep -q "already holds files" "$WORK/out" && pass "exit 1 when --dest is not empty (runs never mixed)" || failed "non-empty dest: $(cat "$WORK/out")"
fi
if fetch; then
	failed "ran without --dest"
else
	pass "exit 1 without --dest"
fi
mkdir -p "$WORK/s3/empty"
if BACKUP_S3_BUCKET=s3://empty/staging fetch --dest "$WORK/fetched-empty"; then
	failed "an empty bucket gave a run"
elif [ ! -e "$WORK/fetched-empty" ]; then
	pass "exit 1 on an empty bucket: $(grep -o '✗.*' "$WORK/out" | head -1)"
else
	failed "empty bucket created the destination"
fi
mkdir -p "$WORK/s3/backups/other/mysql"
echo "plaintext" >"$WORK/s3/backups/other/mysql/financial_scraper_${GOOD}.sql"
if BACKUP_S3_BUCKET=s3://backups/other fetch --dest "$WORK/fetched-norun"; then
	failed "a prefix without encrypted run gave a run"
else
	grep -q "No backup run" "$WORK/out" && pass "exit 1 on a prefix holding no encrypted run" || failed "no run: $(cat "$WORK/out")"
fi
if RCLONE_S3_ENDPOINT="http://127.0.0.1:1" RCLONE_LOW_LEVEL_RETRIES=1 RCLONE_RETRIES=1 RCLONE_CONTIMEOUT=2s \
	fetch --dest "$WORK/fetched-down"; then
	failed "an unreachable store gave a run"
else
	grep -q "Cannot list" "$WORK/out" && pass "exit 1 on an unreachable store" || failed "unreachable store: $(cat "$WORK/out")"
fi
if BACKUP_S3_BUCKET="" fetch --dest "$WORK/fetched-nobucket"; then
	failed "ran without BACKUP_S3_BUCKET"
else
	pass "exit 1 without BACKUP_S3_BUCKET"
fi

echo "verify-backup-key.sh --offsite (issue #327)"
# The key the runs were sealed for decrypts the newest complete run; another
# key does not. The run is fetched into a temporary directory, removed after.
if bash "$ROOT/scripts/verify-backup-key.sh" --identity "$WORK/key.txt" --offsite >"$WORK/out" 2>&1 &&
	grep -q "Run: ${GOOD}" "$WORK/out" && grep -q "Result: PASS (5 component(s) decrypted)" "$WORK/out"; then
	pass "the backup key decrypts every component of ${GOOD}, fetched from the bucket"
else
	failed "verify-backup-key.sh --offsite: $(cat "$WORK/out")"
fi
age-keygen -o "$WORK/foreign.txt" 2>/dev/null
if bash "$ROOT/scripts/verify-backup-key.sh" --identity "$WORK/foreign.txt" --offsite >"$WORK/out" 2>&1; then
	failed "a foreign key passed verify-backup-key.sh --offsite"
else
	grep -q "does not decrypt" "$WORK/out" && pass "exit 1 with a key the runs are not sealed for" ||
		failed "foreign key: $(cat "$WORK/out")"
fi

echo ""
if [ "$FAILED" -ne 0 ]; then
	echo "fetch-offsite tests FAILED"
	exit 1
fi
echo "fetch-offsite tests passed"
