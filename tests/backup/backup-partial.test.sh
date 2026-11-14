#!/usr/bin/env bash
# Failed dumps and run manifests (scripts/backup-lib.sh, issue #288): a dump
# that fails leaves no file, every run lists its successful dumps in a
# manifest, and the restore scripts only pick a complete, verified run.
# Needs bash and age.
#   bash tests/backup/backup-partial.test.sh
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
BACKUP_AGE_RECIPIENTS="$RECIPIENT" init_encryption 2>/dev/null
export BACKUP_AGE_IDENTITY="$WORK/key.txt"

BACKUP_DIR="$WORK/backups"
mkdir -p "$BACKUP_DIR/mysql" "$BACKUP_DIR/spire"

# A complete mysqldump, gzipped.
DUMP_OK=$'CREATE TABLE t (id INT);\nINSERT INTO t VALUES (1);\n-- Dump completed on 2026-11-01  2:00:01\n'
dump_ok() { printf '%s' "$DUMP_OK" | gzip; }
# A dump cut short: a few bytes, then the producer fails.
dump_cut() {
	printf 'DROP TABLE IF EXISTS t;\nCREATE TABLE t' | gzip
	return 1
}

# One backup run of the library, as backup-k8s.sh / backup.sh do it.
new_run() {
	TIMESTAMP="$1"
	OUTPUTS=()
	MANIFEST_ENTRIES=()
}

# Restore dry-run of `$1` (restore.sh or restore-k8s.sh) with the remaining
# arguments: output and exit status (no cluster, no Docker: selection and
# verification happen before any pod or container lookup).
restore_dry() {
	local script="$1"
	shift
	BACKUP_DIR="$BACKUP_DIR" bash "$ROOT/scripts/$script" --dry-run "$@" 2>&1
}

echo "a failed dump leaves nothing behind"
new_run 2026-11-02_020000
file="$BACKUP_DIR/mysql/financial_scraper_${TIMESTAMP}.sql.gz.age"
if write_dump mysql "$file" dump_cut 2>/dev/null; then
	failed "write_dump reported a failed dump as written"
else
	pass "write_dump returns 1 when the producer fails"
fi
[ ! -e "$file" ] && pass "no final file for the failed dump" || failed "the failed dump left $file"
leftover="$(find "$BACKUP_DIR" -name '*.partial*')"
[ -z "$leftover" ] && pass "no .partial file left" || failed "partial files left: $leftover"
[ "${#MANIFEST_ENTRIES[@]}" -eq 0 ] && [ "${#OUTPUTS[@]}" -eq 0 ] &&
	pass "the failed dump is neither in the manifest nor copied off-site" ||
	failed "the failed dump was recorded: ${MANIFEST_ENTRIES[*]} / ${OUTPUTS[*]}"
if write_dump spire "$BACKUP_DIR/spire/keys_${TIMESTAMP}.json.age" printf '' 2>/dev/null; then
	failed "an empty dump was kept"
else
	[ ! -e "$BACKUP_DIR/spire/keys_${TIMESTAMP}.json.age" ] && pass "an empty dump is refused and removed" ||
		failed "the empty dump file was kept"
fi

echo "a successful dump is listed in the run manifest"
new_run 2026-11-01_020000
file="$BACKUP_DIR/mysql/financial_scraper_${TIMESTAMP}.sql.gz.age"
write_dump mysql "$file" dump_ok 2>/dev/null
write_dump spire "$BACKUP_DIR/spire/keys_${TIMESTAMP}.json.age" printf '{"keys":[]}' 2>/dev/null
write_manifest 2>/dev/null
manifest="$BACKUP_DIR/manifests/manifest_${TIMESTAMP}.json.age"
[ -f "$file" ] && pass "the dump is renamed to its final name" || failed "missing $file"
[ -f "$manifest" ] && pass "manifest written, encrypted like the dumps" || failed "missing $manifest"
printf '%s\n' "${OUTPUTS[@]}" | grep -qx "manifests/manifest_${TIMESTAMP}.json.age" &&
	pass "the manifest goes off-site with the dumps" || failed "manifest not in OUTPUTS: ${OUTPUTS[*]}"
plain_sha="$(printf '%s' "$DUMP_OK" | gzip | sha256sum | cut -d' ' -f1)"
# gzip writes no timestamp for stdin: the same input gives the same bytes.
open_backup "$manifest" | grep -q "\"component\":\"mysql\",\"path\":\"mysql/financial_scraper_${TIMESTAMP}.sql.gz.age\",\"size\":$(file_size "$file"),\"sha256\":\"${plain_sha}\"" &&
	pass "entry: relative path, size on disk, sha256 of the plaintext" ||
	failed "manifest content: $(open_backup "$manifest")"
open_backup "$manifest" | node -e 'JSON.parse(require("fs").readFileSync(0, "utf8"))' 2>/dev/null &&
	pass "the manifest is valid JSON" || failed "the manifest is not valid JSON"

echo "latest = the newest run whose manifest lists the component"
# Run 2026-11-02: MySQL failed, SPIRE succeeded. A truncated dump of that run,
# as backups written before the fix left them, sits next to the good one.
new_run 2026-11-02_020000
write_dump spire "$BACKUP_DIR/spire/keys_${TIMESTAMP}.json.age" printf '{"keys":[2]}' 2>/dev/null
write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_${TIMESTAMP}.sql.gz.age" dump_cut 2>/dev/null || true
write_manifest 2>/dev/null
(printf 'DROP TABLE IF EXISTS t;\nCREATE TABLE t' | gzip | seal) >"$BACKUP_DIR/mysql/financial_scraper_2026-11-02_020000.sql.gz.age"
for script in restore.sh restore-k8s.sh; do
	# Issue #330: MySQL and SPIRE come from the same run, the last one that
	# holds both (11-01), not SPIRE of 11-02 next to MySQL of 11-01.
	out="$(restore_dry "$script" --components mysql,spire || true)"
	if echo "$out" | grep -q 'Restoring run 2026-11-01_020000' &&
		echo "$out" | grep -q 'Restoring mysql from: .*financial_scraper_2026-11-01_020000' &&
		echo "$out" | grep -q 'Restoring spire from: .*keys_2026-11-01_020000' &&
		! echo "$out" | grep -q '2026-11-02_020000.json.age|financial_scraper_2026-11-02'; then
		pass "$script: MySQL and SPIRE both from the last complete run (11-01), 11-02 skipped"
	else
		failed "$script picked the wrong runs:"
		echo "$out" | sed 's/^/      /'
	fi
	# One component alone still takes the newest run that has it.
	out="$(restore_dry "$script" --components spire || true)"
	echo "$out" | grep -q 'Restoring spire from: .*keys_2026-11-02_020000' &&
		pass "$script: SPIRE alone from its newest run (11-02)" ||
		failed "$script: SPIRE alone picked the wrong run: $out"
	# No run holds every component: refused, nothing touched.
	if out="$(restore_dry "$script" --components mysql,spire,checkpoints)"; then
		failed "$script accepted components no single run holds"
	elif echo "$out" | grep -q 'no single run holds every requested component'; then
		pass "$script exits 1 when no run holds every component"
	else
		failed "$script refused without the expected message: $out"
	fi
	# Explicit opt-in: the old per-component rule, one warning per component.
	out="$(restore_dry "$script" --allow-mixed-runs --components mysql,spire || true)"
	if echo "$out" | grep -q 'Restoring mysql from: .*financial_scraper_2026-11-01_020000' &&
		echo "$out" | grep -q 'Restoring spire from: .*keys_2026-11-02_020000' &&
		echo "$out" | grep -q 'mysql: taken from run 2026-11-01_020000 on its own' &&
		echo "$out" | grep -q 'spire: taken from run 2026-11-02_020000 on its own'; then
		pass "$script --allow-mixed-runs: per-component runs, one warning each"
	else
		failed "$script --allow-mixed-runs behaved wrongly:"
		echo "$out" | sed 's/^/      /'
	fi
done

echo "--timestamp refuses a component the run did not back up"
for script in restore.sh restore-k8s.sh; do
	if out="$(restore_dry "$script" --components mysql --timestamp 2026-11-02_020000)"; then
		failed "$script restored MySQL from a run whose MySQL dump failed"
	elif echo "$out" | grep -q 'mysql: run 2026-11-02_020000 did not back it up successfully'; then
		pass "$script exits 1 with an explicit message"
	else
		failed "$script refused without the expected message:"
		echo "$out" | sed 's/^/      /'
	fi
done

echo "a file that does not match its manifest is refused"
good="$BACKUP_DIR/mysql/financial_scraper_2026-11-01_020000.sql.gz.age"
manifest="$BACKUP_DIR/manifests/manifest_2026-11-01_020000.json.age"
cp "$good" "$WORK/good.age"
cp "$manifest" "$WORK/manifest.age"
# Same file, same size, another recorded sha256: only the checksum differs.
open_backup "$WORK/manifest.age" | sed "s/${plain_sha}/$(printf '%064d' 0)/" | seal >"$manifest"
for script in restore.sh restore-k8s.sh; do
	out="$(restore_dry "$script" --components mysql || true)"
	echo "$out" | grep -q 'differs from the run manifest' && ! echo "$out" | grep -q 'Would restore MySQL' &&
		pass "$script refuses a sha256 mismatch" || {
		failed "$script accepted a file whose sha256 differs:"
		echo "$out" | sed 's/^/      /'
	}
done
cp "$WORK/manifest.age" "$manifest"
printf 'x' >>"$good"
out="$(restore_dry restore-k8s.sh --components mysql || true)"
echo "$out" | grep -q 'the run manifest says' && pass "a size mismatch is refused" || failed "size mismatch accepted: $out"
mv "$WORK/good.age" "$good"

echo "a MySQL dump without '-- Dump completed' is refused"
# Its manifest entry matches: only the end-of-dump check can catch it.
new_run 2026-11-03_020000
write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_${TIMESTAMP}.sql.gz.age" \
	sh -c "printf 'DROP TABLE IF EXISTS t;\nCREATE TABLE t (id INT);\n' | gzip" 2>/dev/null
write_manifest 2>/dev/null
for script in restore.sh restore-k8s.sh; do
	out="$(restore_dry "$script" --components mysql --timestamp 2026-11-03_020000 || true)"
	echo "$out" | grep -q "does not end with '-- Dump completed'" && ! echo "$out" | grep -q 'Would restore MySQL' &&
		pass "$script refuses the truncated dump" || {
		failed "$script accepted a dump without '-- Dump completed':"
		echo "$out" | sed 's/^/      /'
	}
done
rm -f "$BACKUP_DIR/manifests/manifest_2026-11-03_020000.json.age" "$BACKUP_DIR/mysql/financial_scraper_2026-11-03_020000.sql.gz.age"

echo "an unreadable run manifest makes the restore fail, never succeed silently"
age-keygen -o "$WORK/other-key.txt" 2>/dev/null
# expect_refusal <description> <expected message> <env...> -- <script args...>
expect_refusal() {
	local what="$1" expected="$2" script out status
	shift 2
	local envs=()
	while [ "$1" != "--" ]; do
		envs+=("$1")
		shift
	done
	shift
	for script in restore.sh restore-k8s.sh; do
		status=0
		out="$(env "${envs[@]}" BACKUP_DIR="$BACKUP_DIR" bash "$ROOT/scripts/$script" --dry-run "$@" 2>&1)" || status=$?
		if [ "$status" -eq 1 ] && echo "$out" | grep -q "✗ .*${expected}" &&
			! echo "$out" | grep -q 'Restore complete'; then
			pass "$script, ${what}: exit 1 with an explicit message"
		else
			failed "$script, ${what}: exit ${status}, expected 1 and '✗ …${expected}':"
			echo "$out" | sed 's/^/      /'
		fi
	done
}
expect_refusal "wrong identity (latest)" "cannot read the run manifest" \
	BACKUP_AGE_IDENTITY="$WORK/other-key.txt" -- --components mysql
expect_refusal "wrong identity (--timestamp)" "cannot read the run manifest" \
	BACKUP_AGE_IDENTITY="$WORK/other-key.txt" -- --components mysql --timestamp 2026-11-01_020000
expect_refusal "no identity (latest)" "set BACKUP_AGE_IDENTITY" \
	-u BACKUP_AGE_IDENTITY -- --components mysql
expect_refusal "no identity (--timestamp)" "set BACKUP_AGE_IDENTITY" \
	-u BACKUP_AGE_IDENTITY -- --components mysql --timestamp 2026-11-01_020000
expect_refusal "missing identity file" "is not a readable file" \
	BACKUP_AGE_IDENTITY="$WORK/no-such-key.txt" -- --components mysql
newest="$BACKUP_DIR/manifests/manifest_2026-11-02_020000.json.age"
cp "$newest" "$WORK/newest.age"
printf 'garbage' >"$newest"
expect_refusal "corrupt newest manifest (latest)" "cannot read the run manifest .*2026-11-02" \
	BACKUP_AGE_IDENTITY="$BACKUP_AGE_IDENTITY" -- --components mysql
mv "$WORK/newest.age" "$newest"

echo "a corrupt plaintext run manifest (Docker default: no encryption) is refused too"
# `cat` reads any plaintext file: only the structure check tells a corrupt
# manifest from a run that did not back the component up.
ENCRYPTED_DIR="$BACKUP_DIR" SAVED_SUFFIX="$AGE_SUFFIX"
BACKUP_DIR="$WORK/plain-backups" AGE_SUFFIX=""
mkdir -p "$BACKUP_DIR/mysql"
for ts in 2026-11-01_020000 2026-11-02_020000; do
	new_run "$ts"
	write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_${ts}.sql.gz" dump_ok 2>/dev/null
	write_manifest 2>/dev/null
done
newest="$BACKUP_DIR/manifests/manifest_2026-11-02_020000.json"
out="$(restore_dry restore.sh --components mysql 2>&1 || true)"
echo "$out" | grep -q 'Restoring mysql from: .*2026-11-02_020000' &&
	pass "control: the valid plaintext manifest of 11-02 is used" || failed "plaintext manifest not used: $out"
cp "$newest" "$WORK/newest.json"
# corrupt_plain <description> <new content of the newest manifest>
corrupt_plain() {
	printf '%s' "$2" >"$newest"
	expect_refusal "$1 (latest)" "manifest .*2026-11-02_020000.json is corrupt or truncated" \
		BACKUP_AGE_IDENTITY="$BACKUP_AGE_IDENTITY" -- --components mysql
	expect_refusal "$1 (--timestamp)" "manifest .*2026-11-02_020000.json is corrupt or truncated" \
		BACKUP_AGE_IDENTITY="$BACKUP_AGE_IDENTITY" -- --components mysql --timestamp 2026-11-02_020000
}
corrupt_plain "garbage plaintext manifest" $'garbage\n'
corrupt_plain "truncated plaintext manifest" "$(head -c 60 "$WORK/newest.json")"
corrupt_plain "plaintext manifest without footer" "$(sed '$d' "$WORK/newest.json")"
corrupt_plain "manifest of an unknown version" "$(sed 's/"version":1/"version":2/' "$WORK/newest.json")"
corrupt_plain "entry path outside BACKUP_DIR" \
	"$(sed 's#"path":"mysql/#"path":"../../mysql/#' "$WORK/newest.json")"
mv "$WORK/newest.json" "$newest"
BACKUP_DIR="$ENCRYPTED_DIR" AGE_SUFFIX="$SAVED_SUFFIX"

echo "runs without manifest"
(printf '%s' "$DUMP_OK" | gzip | seal) >"$BACKUP_DIR/mysql/financial_scraper_2026-10-01_020000.sql.gz.age"
out="$(restore_dry restore-k8s.sh --components mysql --timestamp 2026-10-01_020000 || true)"
echo "$out" | grep -q 'no longer restorable' && ! echo "$out" | grep -q 'Restoring mysql from' &&
	pass "refused with --timestamp: no manifest, no restore" || failed "run without manifest not refused: $out"

echo "restore-k8s.sh restores SPIRE only from a run taken since ADR-0065"
new_run 2026-11-05_020000
write_dump spire "$BACKUP_DIR/spire/data_${TIMESTAMP}.tar.age" printf 'tar' 2>/dev/null
write_manifest 2>/dev/null
out="$(restore_dry restore-k8s.sh --components spire --timestamp 2026-11-05_020000 || true)"
echo "$out" | grep -q 'Restoring spire from: .*data_2026-11-05_020000.tar' &&
	! echo "$out" | grep -q 'taken before ADR-0065' &&
	pass "a datastore + keys tar (data_<TS>.tar) is restored" || failed "data_ run: $out"
out="$(restore_dry restore-k8s.sh --components spire --timestamp 2026-11-01_020000 || true)"
echo "$out" | grep -q 'taken before ADR-0065' &&
	pass "keys.json alone (datastore was in MySQL) is refused" || failed "keys_ run accepted: $out"

echo "prune_old removes the partial files of a killed run"
touch "$BACKUP_DIR/mysql/financial_scraper_2026-11-04_020000.sql.gz.age.partial"
touch -d '2 hours ago' "$BACKUP_DIR/mysql/financial_scraper_2026-11-04_020000.sql.gz.age.partial"
touch "$BACKUP_DIR/mysql/fresh.sql.gz.age.partial"
RETENTION_DAYS=30 prune_old 2>/dev/null
[ ! -e "$BACKUP_DIR/mysql/financial_scraper_2026-11-04_020000.sql.gz.age.partial" ] &&
	pass "orphan partial file deleted" || failed "orphan partial file kept"
[ -e "$BACKUP_DIR/mysql/fresh.sql.gz.age.partial" ] && pass "a partial file younger than an hour is kept" ||
	failed "a fresh partial file was deleted"

exit "$FAILED"
