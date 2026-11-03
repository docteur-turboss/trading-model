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

# Gzipped line `$1`: the plaintext of a test dump.
gz_echo() { echo "$1" | gzip; }

# Writes and uploads run `$1` with the components `$2` (comma separated)
# through write_dump and write_manifest, as backup-k8s.sh does; `$3` = legacy
# skips the manifest (a run taken before manifests).
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
				write_dump "$label" "$BACKUP_DIR/mongodb/$ts/$label.archive.gz.age" gz_echo "$label $ts"
			done
			;;
		mongodb-only)
			mkdir -p "$BACKUP_DIR/mongodb/$ts"
			write_dump mongodb "$BACKUP_DIR/mongodb/$ts/mongodb.archive.gz.age" gz_echo "mongodb $ts"
			;;
		mysql)
			mkdir -p "$BACKUP_DIR/mysql"
			write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_$ts.sql.gz.age" gz_echo "mysql $ts"
			;;
		checkpoints)
			mkdir -p "$BACKUP_DIR/checkpoints"
			write_dump checkpoints "$BACKUP_DIR/checkpoints/checkpoints_$ts.tar.gz.age" gz_echo "checkpoints $ts"
			;;
		spire)
			mkdir -p "$BACKUP_DIR/spire"
			write_dump spire "$BACKUP_DIR/spire/keys_$ts.json.age" echo "{\"keys\": \"$ts\"}"
			;;
		esac
	done
	BACKUP_FAILURES=0
	[ "${3:-}" = legacy ] || write_manifest 2>/dev/null
	upload_offsite 2>/dev/null
	[ "$BACKUP_FAILURES" -eq 0 ] || {
		echo "upload_offsite failed for run $ts"
		exit 1
	}
}

OLD=2026-10-30_020000
GOOD=2026-10-31_020000
# The mongodb-audit dump failed: upload_offsite never received it.
BROKEN=2026-11-01_020000
# Taken before run manifests: fetched with a warning.
backup_run "$OLD" mongodb,mysql,checkpoints,spire legacy
backup_run "$GOOD" mongodb,mysql,checkpoints,spire
backup_run "$BROKEN" mongodb-only,mysql,checkpoints,spire
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
	pass "the newest complete run (${GOOD}) and its run manifest are fetched, not the newer incomplete ${BROKEN}"
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
# restore-k8s.sh selection and checks (resolve_and_verify) on the fetched run.
resolved() {
	BACKUP_DIR="$DEST" RESTORE_TIMESTAMP=latest BACKUP_AGE_IDENTITY="$WORK/key.txt" 		resolve_and_verify "$1" 2>/dev/null >/dev/null && echo "$RESOLVED_FILE"
}
if [ "$(resolved mysql)" = "$DEST/mysql/financial_scraper_${GOOD}.sql.gz.age" ] &&
	[ "$(resolved mongodb-audit)" = "$DEST/mongodb/${GOOD}/mongodb-audit.archive.gz.age" ] &&
	[ "$(BACKUP_AGE_IDENTITY="$WORK/key.txt" open_backup "$DEST/mysql/financial_scraper_${GOOD}.sql.gz.age" | gunzip)" = "mysql $GOOD" ]; then
	pass "the layout is the one restore-k8s.sh reads (run manifest, checksums verified)"
else
	failed "restore-k8s.sh lookups do not find the fetched run"
fi
grep -q "restore-k8s.sh --timestamp ${GOOD}" "$WORK/out" && pass "prints the restore command" || failed "no restore command in: $(cat "$WORK/out")"

echo "--timestamp"
if fetch --dest "$WORK/fetched-old" --timestamp "$OLD" &&
	[ "$(find "$WORK/fetched-old" -type f | grep -c "$OLD")" = 5 ] &&
	[ "$(find "$WORK/fetched-old" -type f | wc -l)" = 5 ] &&
	grep -q "has no run manifest" "$WORK/out"; then
	pass "fetches the requested run ${OLD} only (no manifest: warning)"
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

echo "--dry-run"
if fetch --dest "$WORK/fetched-dry" --dry-run && [ ! -e "$WORK/fetched-dry" ] &&
	[ "$(grep -c "Would fetch" "$WORK/out")" = 6 ] && grep -q "$GOOD" "$WORK/out"; then
	pass "lists the 6 files of ${GOOD} (5 dumps + run manifest) and copies nothing"
else
	failed "--dry-run: $(cat "$WORK/out")"
fi

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

echo ""
if [ "$FAILED" -ne 0 ]; then
	echo "fetch-offsite tests FAILED"
	exit 1
fi
echo "fetch-offsite tests passed"
