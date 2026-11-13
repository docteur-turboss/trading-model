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

# shellcheck source=test-lib.sh
source "$ROOT/tests/backup/test-lib.sh"
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

echo "dump binlog coordinates"
C="$WORK/coords"
echo "-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='mysql-bin.000003', SOURCE_LOG_POS=197;" >"$C"
want="server_uuid=u-1 binlog_file=mysql-bin.000003 binlog_pos=197"
got="$(mysql_pitr u-1 "$C" | paste -sd' ' -)"
if [ "$got" = "$want" ]; then pass "MySQL 8.4 coordinates line"; else failed "MySQL 8.4 coordinates line: got '$got', want '$want'"; fi
echo "-- CHANGE MASTER TO MASTER_LOG_FILE='binlog.000012', MASTER_LOG_POS=4;" >"$C"
want="server_uuid=u-1 binlog_file=binlog.000012 binlog_pos=4"
got="$(mysql_pitr u-1 "$C" | paste -sd' ' -)"
if [ "$got" = "$want" ]; then pass "older CHANGE MASTER line"; else failed "older CHANGE MASTER line: got '$got', want '$want'"; fi
: >"$C"
refuse "dump without coordinates" mysql_pitr u-1 "$C"
echo "-- CHANGE REPLICATION SOURCE TO SOURCE_LOG_FILE='', SOURCE_LOG_POS=197;" >"$C"
refuse "empty binlog name" mysql_pitr u-1 "$C"

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

echo "chain breaks (backup_pitr_gap)"
# check <description> <0|1 expected from pitr_broken> <store> <dir>
check_broken() {
	local what="$1" want="$2" got=0
	pitr_broken "$3" "$4" && got=1
	if [ "$got" = "$want" ]; then pass "$what"; else failed "$what: pitr_broken=$got, want $want"; fi
}
BACKUP_DIR="$WORK/gaps"
G="$BACKUP_DIR/mysql/binlog/uuid-1"
mkdir -p "$G"
for f in mysql-bin.000001_2026-11-01_013000 mysql-bin.000002_2026-11-01_023000 mysql-bin.000003_2026-11-01_033000; do
	: >"$G/$f.gz.age"
done
[ -z "$(binlog_break "$G")" ] && pass "an unbroken binlog chain has no break" || failed "binlog_break on an unbroken chain"
check_broken "no break, no daily dump: not broken" 0 mysql "$G"
# 000004 and 000005 purged before the 04:30 run: it resumed at 000006.
: >"$G/mysql-bin.000006_2026-11-01_043000.gz.age"
: >"$G/mysql-bin.000007_2026-11-01_053000.gz.age"
[ "$(binlog_break "$G")" = 2026-11-01_043000 ] && pass "the binlog break is at the run that resumed the chain" || failed "binlog_break: '$(binlog_break "$G")'"
check_broken "a break and no daily dump at all: broken" 1 mysql "$G"
: >"$BACKUP_DIR/mysql/financial_scraper_2026-11-01_020000.pitr.age"
check_broken "a break after the newest dump: broken, even though the next run (05:30) succeeded" 1 mysql "$G"
: >"$BACKUP_DIR/mysql/financial_scraper_2026-11-01_050000.pitr.age"
check_broken "a daily dump taken after the break: repaired" 0 mysql "$G"
GO="$BACKUP_DIR/mongodb/oplog/mongodb-audit"
mkdir -p "$GO"
e0="$(stamp_epoch 2026-11-01_013000)"
: >"$GO/$((e0 - 3600)).1_${e0}.1.bson.gz.age"
: >"$GO/${e0}.1_$((e0 + 3600)).1.bson.gz.age"
check_broken "an unbroken oplog chain: not broken" 0 mongodb-audit "$GO"
# Overwritten between e0+3600 and e0+5000: the next archive restarts at e0+5000.
: >"$GO/$((e0 + 5000)).3_$((e0 + 7200)).1.bson.gz.age"
: >"$GO/$((e0 + 7200)).1_$((e0 + 10800)).1.bson.gz.age"
[ "$(oplog_break "$GO")" = "$((e0 + 5000))" ] && pass "the oplog break is at the archive that does not continue the previous one" || failed "oplog_break: '$(oplog_break "$GO")'"
mkdir -p "$BACKUP_DIR/mongodb/2026-11-01_020000" "$BACKUP_DIR/mongodb/2026-11-01_050000"
: >"$BACKUP_DIR/mongodb/2026-11-01_020000/mongodb-audit.pitr.age"
: >"$BACKUP_DIR/mongodb/2026-11-01_050000/mongodb.pitr.age"
check_broken "an oplog break after the newest dump of that replica set: broken (another set's dump does not count)" 1 mongodb-audit "$GO"
: >"$BACKUP_DIR/mongodb/2026-11-01_050000/mongodb-audit.pitr.age"
check_broken "an oplog dump taken after the break: repaired" 0 mongodb-audit "$GO"

echo "off-site catch-up (record_incremental_archives)"
OUTPUTS=("mysql/binlog/uuid-1/mysql-bin.000007_2026-11-01_053000.gz.age")
: >"$G/mysql-bin.000008_2026-11-01_063000.gz.age.partial"
record_incremental_archives
want="$(cd "$BACKUP_DIR" && find mysql/binlog mongodb/oplog -type f -name '*.gz.age' | sort)"
got="$(printf '%s\n' "${OUTPUTS[@]}" | sort)"
if [ "$got" = "$want" ] && [ "${#OUTPUTS[@]}" -eq "$(echo "$want" | wc -l)" ]; then
	pass "every archive on the volume is queued for the off-site copy, once each, no .partial"
else
	failed "queued: $got"
fi
METRICS_FILE="$WORK/metrics/gap.prom"
BACKUP_RUN=incremental
_METRICS_TMP=""
BACKUP_FAILURES=0
write_pitr_gap mongodb-audit-oplog 1
finalize_metrics >/dev/null 2>&1
if grep -qx 'backup_pitr_gap{component="mongodb-audit-oplog",run="incremental"} 1' "$METRICS_FILE" && [ "$BACKUP_FAILURES" -eq 0 ]; then
	pass "backup_pitr_gap carries run=\"incremental\" and is not counted as a failure"
else
	failed "backup_pitr_gap: $(cat "$METRICS_FILE")"
fi
METRICS_FILE=""
BACKUP_RUN=""
_METRICS_TMP=""
OUTPUTS=()

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

echo "restore-k8s.sh --until checks every component before writing any"
# MongoDB's chains are complete, MySQL has no binlog archive at all: the
# restore must refuse before mongorestore ever runs (no database brought back
# alone). kubectl is a stub that records the commands it gets.
R="$WORK/restore"
BACKUP_DIR="$R/backups"
STUB="$R/bin"
mkdir -p "$STUB" "$BACKUP_DIR"
cat >"$STUB/kubectl" <<'STUB_EOF'
#!/usr/bin/env bash
echo "$*" >>"$KUBECTL_LOG"
# A pod reading a stream drains it (the restore pipes into kubectl exec -i).
case " $* " in *" -i "*) cat >/dev/null ;; esac
case "$*" in
*"get pods"*) echo "mongo-0" ;;
*"get service"*) echo "mysql-0" ;;
*isWritablePrimary*) echo "true" ;;
*"status.succeeded"*) echo -n 1 ;; # retention Job done
esac
exit 0
STUB_EOF
printf '#!/bin/sh\ncat >/dev/null\n' >"$STUB/mysqlbinlog"
chmod +x "$STUB/kubectl" "$STUB/mysqlbinlog"
TIMESTAMP=2026-11-01_020000
DUMP_EPOCH="$(stamp_epoch "$TIMESTAMP")"
OUTPUTS=()
MANIFEST_ENTRIES=()
mkdir -p "$BACKUP_DIR/mongodb/$TIMESTAMP" "$BACKUP_DIR/mysql" "$BACKUP_DIR/mongodb/oplog/mongodb" "$BACKUP_DIR/mongodb/oplog/mongodb-audit"
gz_of() { printf '%s\n' "$1" | gzip; }
for label in mongodb mongodb-audit; do
	write_dump "$label" "$BACKUP_DIR/mongodb/$TIMESTAMP/$label.archive.gz" gz_of "$label" 2>/dev/null
	echo "oplog_ts=$((DUMP_EPOCH - 10)).1" >"$BACKUP_DIR/mongodb/$TIMESTAMP/$label.pitr"
	gz_of oplog >"$BACKUP_DIR/mongodb/oplog/$label/$((DUMP_EPOCH - 3600)).1_$((DUMP_EPOCH + 7200)).1.bson.gz"
done
write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_$TIMESTAMP.sql.gz" gz_of "-- Dump completed" 2>/dev/null
printf 'server_uuid=u-1\nbinlog_file=mysql-bin.000001\nbinlog_pos=4\n' >"$BACKUP_DIR/mysql/financial_scraper_$TIMESTAMP.pitr"
write_manifest >/dev/null 2>&1
export KUBECTL_LOG="$R/kubectl.log"
: >"$KUBECTL_LOG"
if PATH="$STUB:$PATH" BACKUP_DIR="$BACKUP_DIR" bash "$ROOT/scripts/restore-k8s.sh" --components mongodb,mysql \
	--until "2026-11-01 03:00:00" >"$R/out" 2>&1; then
	failed "restore-k8s.sh accepted a MySQL chain with no archive: $(tail -5 "$R/out")"
elif grep -q mongorestore "$KUBECTL_LOG"; then
	failed "MongoDB was restored before the MySQL refusal: $(grep mongorestore "$KUBECTL_LOG" | head -1)"
elif grep -q "nothing was touched" "$R/out" && grep -q "mongodb-audit: 1 oplog archive(s) to replay" "$R/out"; then
	pass "exit 1 before any write: MongoDB checked fine, MySQL refused, mongorestore never ran"
else
	failed "unexpected restore output: $(tail -8 "$R/out")"
fi
mkdir -p "$BACKUP_DIR/mysql/binlog/u-1"
gz_of binlog >"$BACKUP_DIR/mysql/binlog/u-1/mysql-bin.000001_2026-11-01_033000.gz"
: >"$KUBECTL_LOG"
if PATH="$STUB:$PATH" BACKUP_DIR="$BACKUP_DIR" bash "$ROOT/scripts/restore-k8s.sh" --components mongodb,mysql \
	--until "2026-11-01 03:00:00" >"$R/out" 2>&1 &&
	[ "$(grep -c 'mongorestore --quiet --gzip --archive --drop --oplogReplay' "$KUBECTL_LOG")" -eq 2 ] &&
	[ "$(grep -c 'Checksum verified' "$R/out")" -eq 3 ]; then
	pass "once every chain reaches the instant, both stores are restored, each dump checksummed once"
else
	failed "complete chains: $(tail -8 "$R/out")"
fi
unset KUBECTL_LOG
TIMESTAMP=""

echo "backup scripts carry no literal \\n where a line continuation belongs"
# A merge resolution once left `-- \n      mongorestore …` in restore-k8s.sh:
# bash -n accepts it, kubectl exec then runs a command named "n".
if stray="$(grep -nE '\\n[[:space:]]{2,}[[:alnum:]-]' "$ROOT"/scripts/*.sh)"; then
	failed "literal \\n before an indented word: $stray"
else
	pass "no literal \\n before an indented word"
fi

echo ""
[ "$FAILED" -eq 0 ] && echo "All PITR chain tests passed" || echo "PITR chain tests FAILED"
exit "$FAILED"
