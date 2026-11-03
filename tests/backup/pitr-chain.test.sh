#!/usr/bin/env bash
# Point-in-time recovery chains (scripts/backup-lib.sh, ADR-0031): which
# archived binlogs / oplogs restore-k8s.sh --until replays, and the gaps that
# make it refuse. Needs bash and GNU date.
#   bash tests/backup/pitr-chain.test.sh
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

# Names only, the directory stripped, space separated.
names() { sed 's|.*/||' | paste -sd' ' -; }

# expect <description> <expected names> <command...>: the command succeeds
# and prints exactly these archives.
expect() {
	local what="$1" want="$2" got
	shift 2
	if got="$("$@" 2>"$WORK/err" | names)"; then
		if [ "$got" = "$want" ]; then pass "$what"; else failed "$what: got '$got', want '$want'"; fi
	else
		failed "$what: refused ($(cat "$WORK/err"))"
	fi
}

# refuse <description> <command...>: the command fails and says why.
refuse() {
	local what="$1"
	shift
	if "$@" >/dev/null 2>"$WORK/err"; then
		failed "$what: accepted"
	elif [ -s "$WORK/err" ]; then
		pass "$what ($(head -1 "$WORK/err"))"
	else
		failed "$what: refused without a reason"
	fi
}

echo "binlog chain"
B="$WORK/binlog"
mkdir -p "$B"
# Runs at 01:30 (first run: 3 closed binlogs), 02:30 and 03:30.
for f in mysql-bin.000001_2026-11-01_013000 mysql-bin.000002_2026-11-01_013000 mysql-bin.000003_2026-11-01_013000 \
	mysql-bin.000004_2026-11-01_023000 mysql-bin.000005_2026-11-01_033000; do
	: >"$B/$f.gz.age"
done
: >"$B/mysql-bin.000006_2026-11-01_043000.gz.age.partial"
expect "from the dump's binlog up to the first run after the instant" \
	"mysql-bin.000003_2026-11-01_013000.gz.age mysql-bin.000004_2026-11-01_023000.gz.age" \
	binlog_chain "$B" mysql-bin.000003 2026-11-01_020000
expect "an instant equal to a run stamp is covered by that run" \
	"mysql-bin.000003_2026-11-01_013000.gz.age mysql-bin.000004_2026-11-01_023000.gz.age" \
	binlog_chain "$B" mysql-bin.000003 2026-11-01_023000
expect "every binlog of the covering run is replayed" \
	"mysql-bin.000001_2026-11-01_013000.gz.age mysql-bin.000002_2026-11-01_013000.gz.age mysql-bin.000003_2026-11-01_013000.gz.age" \
	binlog_chain "$B" mysql-bin.000001 2026-11-01_010000
refuse "an instant after the last run is refused (.partial ignored)" binlog_chain "$B" mysql-bin.000003 2026-11-01_040000
refuse "a dump binlog never archived is refused" binlog_chain "$B" mysql-bin.000007 2026-11-01_020000
rm "$B/mysql-bin.000004_2026-11-01_023000.gz.age"
refuse "a missing binlog between the dump and the instant is refused" binlog_chain "$B" mysql-bin.000003 2026-11-01_030000
expect "a gap after the covering run does not matter" \
	"mysql-bin.000003_2026-11-01_013000.gz.age" \
	binlog_chain "$B" mysql-bin.000003 2026-11-01_012000
refuse "no archive at all is refused" binlog_chain "$WORK/none" mysql-bin.000001 2026-11-01_012000
mkdir -p "$WORK/big"
: >"$WORK/big/mysql-bin.000999_2026-11-01_013000.gz"
: >"$WORK/big/mysql-bin.001000_2026-11-01_023000.gz"
expect "binlog indexes are compared as numbers, unencrypted names too" \
	"mysql-bin.000999_2026-11-01_013000.gz mysql-bin.001000_2026-11-01_023000.gz" \
	binlog_chain "$WORK/big" mysql-bin.000999 2026-11-01_020000

echo "oplog chain"
O="$WORK/oplog"
mkdir -p "$O"
for f in 1000.1_1999.4 1999.4_3000.1 3000.1_4000.9 4000.9_5000.2; do
	: >"$O/$f.bson.gz.age"
done
: >"$O/5000.2_6000.1.bson.gz.age.partial"
expect "from the archive holding the dump's point to the first one ending after the instant" \
	"1999.4_3000.1.bson.gz.age 3000.1_4000.9.bson.gz.age" \
	oplog_chain "$O" 2500.3 3500
expect "a point equal to an archive end starts at the archive ending there (one entry replayed twice: harmless)" \
	"1000.1_1999.4.bson.gz.age 1999.4_3000.1.bson.gz.age" \
	oplog_chain "$O" 1999.4 2800
expect "an instant equal to an archive end second is covered by it" \
	"3000.1_4000.9.bson.gz.age" \
	oplog_chain "$O" 3000.5 4000
refuse "an instant after the last archive is refused (.partial ignored)" oplog_chain "$O" 2500.3 5500
refuse "a dump older than every archive is refused" oplog_chain "$O" 900.1 3500
rm "$O/3000.1_4000.9.bson.gz.age"
: >"$O/3100.1_4000.9.bson.gz.age"
refuse "entries lost between two archives are refused" oplog_chain "$O" 2500.3 3500
expect "a gap after the instant does not matter" \
	"1999.4_3000.1.bson.gz.age" \
	oplog_chain "$O" 2500.3 3000
mkdir -p "$WORK/inc"
: >"$WORK/inc/1000.9_1000.10.bson.gz"
: >"$WORK/inc/1000.10_2000.1.bson.gz"
expect "increments are compared as numbers" \
	"1000.9_1000.10.bson.gz 1000.10_2000.1.bson.gz" \
	oplog_chain "$WORK/inc" 1000.9 1500

echo "helpers"
[ "$(stamp_epoch 2026-11-01_020304)" = "$(date -u -d '2026-11-01 02:03:04' +%s)" ] &&
	pass "stamp_epoch reads a backup stamp as UTC" || failed "stamp_epoch"
oplog_le 10.2 10.10 && ! oplog_le 11.1 10.10 && oplog_le 10.10 10.10 &&
	pass "oplog_le orders seconds then increments" || failed "oplog_le"
[ "$(printf 'server_uuid=u\nbinlog_file=mysql-bin.000003\nbinlog_pos=864\n' | pitr_field binlog_pos)" = "864" ] &&
	pass "pitr_field reads a metadata value" || failed "pitr_field"
if sealed_write "$WORK/ok.txt" printf 'data' && [ "$(cat "$WORK/ok.txt")" = "data" ] && [ ! -e "$WORK/ok.txt.partial" ]; then
	pass "sealed_write publishes a complete file"
else
	failed "sealed_write success"
fi
producer_fails() {
	printf 'half'
	return 1
}
if sealed_write "$WORK/ko.txt" producer_fails; then
	failed "sealed_write accepted a failed producer"
elif [ -e "$WORK/ko.txt" ] || [ -e "$WORK/ko.txt.partial" ]; then
	failed "sealed_write left a file behind a failed producer"
else
	pass "a failed producer leaves neither a final nor a partial file"
fi

echo "metrics of the incremental job"
METRICS_FILE="$WORK/metrics/incremental.prom"
BACKUP_RUN=incremental
write_metric "mysql-binlog" 1
finalize_metrics >/dev/null 2>&1
if grep -qx 'backup_last_status{component="mysql-binlog",run="incremental"} 1' "$METRICS_FILE" &&
	grep -q '^backup_last_run_timestamp{run="incremental"} ' "$METRICS_FILE" &&
	! grep -q '^backup_encrypted ' "$METRICS_FILE"; then
	pass "every series carries run=\"incremental\": no clash with the daily job's file"
else
	failed "incremental metrics: $(cat "$METRICS_FILE")"
fi
_METRICS_TMP=""
write_metric "mysql-binlog" 0
finalize_metrics >/dev/null 2>&1
last="$(sed -n 's/^backup_last_success_timestamp{component="mysql-binlog",run="incremental"} //p' "$METRICS_FILE")"
[ -n "$last" ] && [ "$last" != "0" ] && pass "a failed run keeps the previous success time" || failed "last success lost: $(cat "$METRICS_FILE")"
METRICS_FILE=""
BACKUP_RUN=""

echo "daily run before the instant (restore-k8s.sh --until, RESTORE_NOT_AFTER)"
BACKUP_DIR="$WORK/runs"
for TIMESTAMP in 2026-11-01_020000 2026-11-02_020000; do
	mkdir -p "$BACKUP_DIR/mysql"
	OUTPUTS=()
	MANIFEST_ENTRIES=()
	write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_${TIMESTAMP}.sql.gz" printf 'dump %s\n' "$TIMESTAMP" 2>/dev/null
	write_manifest >/dev/null 2>&1
done
RESTORE_TIMESTAMP=latest
RESTORE_NOT_AFTER=2026-11-02_013000
if resolve_backup mysql 2>/dev/null && [ "${RESOLVED_FILE##*/}" = "financial_scraper_2026-11-01_020000.sql.gz" ]; then
	pass "the newest run taken before the instant is picked, not a later one"
else
	failed "RESTORE_NOT_AFTER=2026-11-02_013000 picked '${RESOLVED_FILE:-}'"
fi
RESTORE_NOT_AFTER=2026-11-02_020000
if resolve_backup mysql 2>/dev/null && [ "${RESOLVED_FILE##*/}" = "financial_scraper_2026-11-02_020000.sql.gz" ]; then
	pass "a run taken at the instant itself is picked"
else
	failed "RESTORE_NOT_AFTER=2026-11-02_020000 picked '${RESOLVED_FILE:-}'"
fi
RESTORE_NOT_AFTER=2026-10-31_235959
refuse "no run taken before the instant" resolve_backup mysql
RESTORE_NOT_AFTER=""

echo ""
[ "$FAILED" -eq 0 ] && echo "All PITR chain tests passed" || echo "PITR chain tests FAILED"
exit "$FAILED"
