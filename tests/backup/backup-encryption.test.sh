#!/usr/bin/env bash
# Backup encryption (scripts/backup-lib.sh): age round trip, refusals, and
# the restore scripts finding `*.age` backups. Needs bash and age.
#   bash tests/backup/backup-encryption.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

# shellcheck source=test-lib.sh
source "$ROOT/tests/backup/test-lib.sh"
# shellcheck source=../../scripts/backup-lib.sh
source "$ROOT/scripts/backup-lib.sh"

age-keygen -o "$WORK/key.txt" 2>/dev/null
RECIPIENT="$(sed -n 's/^# public key: //p' "$WORK/key.txt")"

echo "seal / open_backup"
BACKUP_AGE_RECIPIENTS="$RECIPIENT" init_encryption
[ "$AGE_SUFFIX" = ".age" ] && pass "encryption enabled by BACKUP_AGE_RECIPIENTS" || failed "AGE_SUFFIX=$AGE_SUFFIX"
echo "CREATE TABLE market_candles (id INT);" | gzip | seal >"$WORK/dump.sql.gz.age"
if gunzip -t <"$WORK/dump.sql.gz.age" 2>/dev/null; then
	failed "the sealed file is readable without the key"
else
	pass "the sealed file is not readable without the key"
fi
if [ "$(BACKUP_AGE_IDENTITY="$WORK/key.txt" open_backup "$WORK/dump.sql.gz.age" | gunzip)" = "CREATE TABLE market_candles (id INT);" ]; then
	pass "open_backup decrypts with the private key"
else
	failed "open_backup round trip"
fi
if (unset BACKUP_AGE_IDENTITY; open_backup "$WORK/dump.sql.gz.age" >/dev/null 2>&1); then
	failed "an encrypted backup opened without BACKUP_AGE_IDENTITY"
else
	pass "an encrypted backup needs BACKUP_AGE_IDENTITY"
fi

echo "refusals"
if (AGE_ARGS=(); BACKUP_AGE_RECIPIENTS="" BACKUP_REQUIRE_ENCRYPTION=true init_encryption 2>/dev/null); then
	failed "BACKUP_REQUIRE_ENCRYPTION accepted no recipient"
else
	pass "BACKUP_REQUIRE_ENCRYPTION refuses to run without recipient"
fi
if (AGE_ARGS=(); BACKUP_AGE_RECIPIENTS="age1notakey" init_encryption 2>/dev/null); then
	failed "an invalid recipient was accepted"
else
	pass "an invalid recipient is rejected before any dump"
fi
if (
	AGE_SUFFIX="" BACKUP_S3_BUCKET="s3://bucket" METRICS_FILE="" OUTPUTS=("x")
	upload_offsite 2>/dev/null
	[ "$BACKUP_FAILURES" -eq 1 ]
); then
	pass "unencrypted backups are never copied off-site"
else
	failed "upload_offsite accepted unencrypted backups"
fi
if BACKUP_DIR="$WORK/none" BACKUP_REQUIRE_ENCRYPTION=true BACKUP_AGE_RECIPIENTS="" \
	bash "$ROOT/scripts/backup.sh" --components mysql >/dev/null 2>&1; then
	failed "backup.sh ran without recipient under BACKUP_REQUIRE_ENCRYPTION"
else
	pass "backup.sh exits 1 without recipient under BACKUP_REQUIRE_ENCRYPTION"
fi

echo "metrics"
METRICS_FILE="$WORK/metrics/backup.prom"
mkdir -p "$WORK/metrics"
echo 'backup_last_success_timestamp{component="mysql"} 1700000000' >"$METRICS_FILE"
_METRICS_TMP=""
write_metric mysql 0
write_metric redis 1
finalize_metrics 2>/dev/null
grep -qx 'backup_last_success_timestamp{component="mysql"} 1700000000' "$METRICS_FILE" &&
	pass "a failure keeps the previous success timestamp" || failed "failure overwrote the success timestamp"
grep -qx 'backup_encrypted 1' "$METRICS_FILE" && pass "backup_encrypted 1 exported" || failed "backup_encrypted missing"
[ "$(grep -c 'component="redis"' "$METRICS_FILE")" -eq 2 ] && pass "the metrics file is rewritten, not appended" ||
	failed "duplicate series in the metrics file"

echo "off-site copy required"
(
	METRICS_FILE="$WORK/offsite.prom"
	BACKUP_FAILURES=0
	BACKUP_S3_BUCKET="" BACKUP_REQUIRE_OFFSITE=true upload_offsite 2>/dev/null
	finalize_metrics 2>/dev/null
	[ "$BACKUP_FAILURES" -eq 1 ] && grep -qx 'backup_last_status{component="offsite"} 0' "$METRICS_FILE"
) && pass "BACKUP_REQUIRE_OFFSITE=true without bucket fails the run" ||
	failed "a run without off-site copy passed despite BACKUP_REQUIRE_OFFSITE=true"

echo "restore scripts find *.age backups (through the run manifest)"
BACKUPS="$WORK/backups"
mkdir -p "$BACKUPS/mysql" "$BACKUPS/spire" "$BACKUPS/checkpoints"
BACKUP_DIR="$BACKUPS" TIMESTAMP=2026-01-01_020000 OUTPUTS=() MANIFEST_ENTRIES=()
write_dump mysql "$BACKUPS/mysql/financial_scraper_${TIMESTAMP}.sql.gz${AGE_SUFFIX}" sh -c "printf 'CREATE TABLE t (id INT);\n-- Dump completed\n' | gzip" 2>/dev/null
# SPIRE: datastore + CA keys tar, the format of both scripts since ADR-0065.
write_dump spire "$BACKUPS/spire/data_${TIMESTAMP}.tar${AGE_SUFFIX}" echo x 2>/dev/null
write_dump checkpoints "$BACKUPS/checkpoints/checkpoints_${TIMESTAMP}.tar.gz${AGE_SUFFIX}" echo x 2>/dev/null
write_manifest 2>/dev/null
for script in restore.sh restore-k8s.sh; do
	out="$(BACKUP_DIR="$BACKUPS" BACKUP_AGE_IDENTITY="$WORK/key.txt" bash "$ROOT/scripts/$script" --dry-run \
		--components mysql,spire,checkpoints --timestamp 2026-01-01_020000 2>&1 || true)"
	if echo "$out" | grep -q 'financial_scraper_2026-01-01_020000.sql.gz.age' &&
		echo "$out" | grep -q 'data_2026-01-01_020000.tar.age'; then
		pass "$script resolves the encrypted files"
	else
		failed "$script did not find the encrypted files:"
		echo "$out" | sed 's/^/      /'
	fi
done

exit "$FAILED"
