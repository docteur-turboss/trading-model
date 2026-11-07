#!/usr/bin/env bash
# Two age recipients in production and proof that a key decrypts the backups
# (issue #327): BACKUP_MIN_RECIPIENTS in init_encryption (scripts/backup-lib.sh),
# the deploy.yml check (scripts/backup-recipients-check.sh), and
# scripts/verify-backup-key.sh on a run written by write_dump / write_manifest
# for two keys: each key passes, a third key fails, a component sealed for
# another key or missing from the run fails. Needs bash and age.
#   bash tests/backup/backup-key-verify.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
VERIFY="$ROOT/scripts/verify-backup-key.sh"
CHECK="$ROOT/scripts/backup-recipients-check.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

# shellcheck source=test-lib.sh
source "$ROOT/tests/backup/test-lib.sh"
indent() {
	local line
	while IFS= read -r line; do echo "      $line"; done <<<"$1"
}

# shellcheck source=../../scripts/backup-lib.sh
source "$ROOT/scripts/backup-lib.sh"

for k in operator escrow foreign; do
	age-keygen -o "$WORK/$k.txt" 2>/dev/null
	chmod 600 "$WORK/$k.txt"
done
pub() { sed -n 's/^# public key: //p' "$WORK/$1.txt"; }
OPERATOR="$(pub operator)" ESCROW="$(pub escrow)" FOREIGN="$(pub foreign)"

# --- init_encryption: minimum number of recipients ---------------------------
echo "init_encryption with BACKUP_MIN_RECIPIENTS"
# accepts <name> <min> <recipients>: init_encryption succeeds
accepts() {
	if (AGE_ARGS=() AGE_SUFFIX="" BACKUP_MIN_RECIPIENTS="$2" BACKUP_AGE_RECIPIENTS="$3" init_encryption 2>/dev/null); then
		pass "$1"
	else
		failed "$1: refused"
	fi
}
# refuses <name> <min> <recipients>: init_encryption returns 1
refuses() {
	if (AGE_ARGS=() AGE_SUFFIX="" BACKUP_MIN_RECIPIENTS="$2" BACKUP_AGE_RECIPIENTS="$3" init_encryption 2>/dev/null); then
		failed "$1: accepted"
	else
		pass "$1"
	fi
}
accepts "default minimum (1): one recipient accepted" "" "$OPERATOR"
refuses "minimum 2: one recipient refused" 2 "$OPERATOR"
refuses "minimum 2: the same key twice counts once" 2 "$OPERATOR $OPERATOR"
refuses "minimum 2: no recipient refused, even without BACKUP_REQUIRE_ENCRYPTION" 2 ""
refuses "minimum 2: an invalid second key refused" 2 "$OPERATOR age1notakey"
refuses "BACKUP_MIN_RECIPIENTS that is not a positive integer refused" abc "$OPERATOR $ESCROW"
refuses "BACKUP_MIN_RECIPIENTS=0 refused" 0 "$OPERATOR $ESCROW"
accepts "minimum 2: two distinct recipients (space separated) accepted" 2 "$OPERATOR $ESCROW"
accepts "minimum 2: two distinct recipients (newline separated) accepted" 2 "$OPERATOR
$ESCROW"
(
	AGE_ARGS=()
	BACKUP_MIN_RECIPIENTS=2 BACKUP_AGE_RECIPIENTS="$OPERATOR $ESCROW $OPERATOR" init_encryption 2>/dev/null
	[ "${#AGE_ARGS[@]}" -eq 4 ]
) && pass "a duplicated key is passed to age once" || failed "duplicated key passed twice to age"

out="$WORK/backup-metrics"
mkdir -p "$out"
if BACKUP_DIR="$WORK/none" METRICS_FILE="$out/backup.prom" BACKUP_REQUIRE_ENCRYPTION=true \
	BACKUP_MIN_RECIPIENTS=2 BACKUP_AGE_RECIPIENTS="$OPERATOR" \
	bash "$ROOT/scripts/backup.sh" --components mysql >/dev/null 2>&1; then
	failed "backup.sh ran with one recipient under BACKUP_MIN_RECIPIENTS=2"
else
	grep -qx 'backup_last_status{component="encryption"} 0' "$out/backup.prom" &&
		pass "backup.sh exits 1 with one recipient, backup_last_status{component=\"encryption\"} 0 (BackupUnencrypted)" ||
		failed "backup.sh failed without the encryption metric: $(cat "$out/backup.prom" 2>/dev/null)"
fi

# --- deploy.yml check: scripts/backup-recipients-check.sh --------------------
echo "backup-recipients-check.sh"
# expect <name> <exit> <annotation: error|warning|none> <recipients> <args...>
expect() {
	local name="$1" want_exit="$2" want_note="$3" recipients="$4" out code=0
	shift 4
	out="$(BACKUP_AGE_RECIPIENTS="$recipients" bash "$CHECK" "$@" 2>&1)" || code=$?
	if [ "$code" -ne "$want_exit" ]; then
		failed "$name: exit $code, expected $want_exit"
		indent "$out"
		return
	fi
	case "$want_note" in
	none) if grep -q '^::\(error\|warning\)::' <<<"$out"; then
		failed "$name: unexpected annotation"
		indent "$out"
		return
	fi ;;
	*) if ! grep -q "^::${want_note}::" <<<"$out"; then
		failed "$name: no ::${want_note}::"
		indent "$out"
		return
	fi ;;
	esac
	pass "$name"
}
expect "production, two distinct keys: pass" 0 none "$OPERATOR $ESCROW" --environment production --min 2
expect "production, one key: error" 1 error "$OPERATOR" --environment production --min 2
expect "production, floor 2 even with --min 1" 1 error "$OPERATOR" --environment production --min 1
expect "production, the same key twice: error" 1 error "$OPERATOR $OPERATOR" --environment production --min 2
expect "production, no key: error" 1 error "" --environment production --min 2
expect "production, a token that is not an age1 key: error" 1 error "$OPERATOR $ESCROW ssh-ed25519" --environment production --min 2
expect "production, three keys with --min 3: pass" 0 none "$OPERATOR $ESCROW $FOREIGN" --environment production --min 3
expect "staging, one key: pass" 0 none "$OPERATOR" --environment staging --min 1
expect "staging, below its --min: warning only" 0 warning "$OPERATOR" --environment staging --min 2
expect "--min that is not a number: usage error" 2 error "$OPERATOR $ESCROW" --environment production --min two
expect "no --environment: usage error" 2 error "$OPERATOR $ESCROW"

# --- verify-backup-key.sh ----------------------------------------------------
echo "verify-backup-key.sh"
AGE_ARGS=() AGE_SUFFIX=""
BACKUP_MIN_RECIPIENTS=2 BACKUP_AGE_RECIPIENTS="$OPERATOR $ESCROW" init_encryption 2>/dev/null
METRICS_FILE=""
plain() { printf '%s\n' "$1"; }

# Writes run `$1` into directory `$2`, the way backup-k8s.sh lays it out,
# with the components `$3` (comma separated, default all).
backup_run() {
	local ts="$1" part
	BACKUP_DIR="$2"
	TIMESTAMP="$ts"
	OUTPUTS=()
	MANIFEST_ENTRIES=()
	mkdir -p "$BACKUP_DIR/mongodb/$ts" "$BACKUP_DIR/mysql" "$BACKUP_DIR/checkpoints" "$BACKUP_DIR/spire"
	IFS=',' read -ra parts <<<"${3:-mongodb,mongodb-audit,mysql,checkpoints,spire}"
	for part in "${parts[@]}"; do
		case "$part" in
		mongodb | mongodb-audit) write_dump "$part" "$BACKUP_DIR/mongodb/$ts/$part.archive.gz.age" plain "$part $ts" ;;
		mysql) write_dump mysql "$BACKUP_DIR/mysql/financial_scraper_$ts.sql.gz.age" plain "mysql $ts" ;;
		checkpoints) write_dump checkpoints "$BACKUP_DIR/checkpoints/checkpoints_$ts.tar.gz.age" plain "checkpoints $ts" ;;
		spire) write_dump spire "$BACKUP_DIR/spire/keys_$ts.json.age" plain "{\"spire\":\"$ts\"}" ;;
		esac
	done
	write_manifest 2>/dev/null
}

RUNS="$WORK/runs"
backup_run 2026-11-01_020000 "$RUNS"
backup_run 2026-11-02_020000 "$RUNS"

# verify <name> <exit> <grep pattern in the output> <args...>
verify() {
	local name="$1" want_exit="$2" pattern="$3" out code=0
	shift 3
	out="$(bash "$VERIFY" "$@" 2>&1)" || code=$?
	if [ "$code" -ne "$want_exit" ]; then
		failed "$name: exit $code, expected $want_exit"
		indent "$out"
		return
	fi
	if ! grep -q -- "$pattern" <<<"$out"; then
		failed "$name: output lacks '$pattern'"
		indent "$out"
		return
	fi
	pass "$name"
}
verify "operator key decrypts the newest run" 0 "Run: 2026-11-02_020000 (2026-11-02 02:00:00 UTC)" --identity "$WORK/operator.txt" --dir "$RUNS"
verify "escrow key decrypts the newest run" 0 "Result: PASS (5 component(s) decrypted)" --identity "$WORK/escrow.txt" --dir "$RUNS"
verify "the report names the key" 0 "Key: ${ESCROW}" --identity "$WORK/escrow.txt" --dir "$RUNS"
verify "a foreign key fails" 1 "does not decrypt with ${FOREIGN}" --identity "$WORK/foreign.txt" --dir "$RUNS"
verify "--timestamp verifies an older run" 0 "Run: 2026-11-01_020000" --identity "$WORK/escrow.txt" --dir "$RUNS" --timestamp 2026-11-01_020000
verify "an unknown --timestamp fails" 1 "No run manifest for run 2026-10-01_020000" --identity "$WORK/escrow.txt" --dir "$RUNS" --timestamp 2026-10-01_020000
verify "a missing identity file fails" 1 "is not a readable file" --identity "$WORK/nope.txt" --dir "$RUNS"
verify "a file that is not an age identity fails" 1 "is not an age identity file" --identity "$RUNS/mysql/financial_scraper_2026-11-02_020000.sql.gz.age" --dir "$RUNS"
verify "--identity is required" 1 "--identity is required" --dir "$RUNS"

# One component sealed for another key only: the run fails on it alone.
ONE="$WORK/one-foreign"
backup_run 2026-11-03_020000 "$ONE"
mysql_file="$ONE/mysql/financial_scraper_2026-11-03_020000.sql.gz.age"
plain "mysql 2026-11-03_020000" | age -r "$FOREIGN" >"$mysql_file"
verify "one component the key cannot decrypt fails the run" 1 "FAIL mysql: mysql/financial_scraper_2026-11-03_020000.sql.gz.age does not decrypt with this key" --identity "$WORK/escrow.txt" --dir "$ONE"
verify "the other components are still reported" 1 "OK   spire" --identity "$WORK/escrow.txt" --dir "$ONE"

# A component whose dump failed (absent from the manifest).
PARTIAL="$WORK/partial"
backup_run 2026-11-04_020000 "$PARTIAL" mongodb,mongodb-audit,mysql,spire
verify "a component absent from the run fails" 1 "FAIL checkpoints: absent from the run manifest" --identity "$WORK/escrow.txt" --dir "$PARTIAL"
verify "--components limits the check" 0 "Result: PASS (2 component(s) decrypted)" --identity "$WORK/escrow.txt" --dir "$PARTIAL" --components mongodb-audit,mysql

# A decrypted file that differs from the manifest (replaced after the run).
TAMPERED="$WORK/tampered"
backup_run 2026-11-05_020000 "$TAMPERED"
plain "spire other" | seal >"$TAMPERED/spire/keys_2026-11-05_020000.json.age"
verify "a file that differs from the manifest fails" 1 "FAIL spire: spire/keys_2026-11-05_020000.json.age differs from the run manifest" --identity "$WORK/escrow.txt" --dir "$TAMPERED"

# No plaintext written: the run directories still hold only sealed files.
if [ -z "$(find "$RUNS" "$ONE" "$PARTIAL" "$TAMPERED" -type f ! -name '*.age')" ]; then
	pass "no plaintext file written next to the runs"
else
	failed "plaintext files written: $(find "$RUNS" "$ONE" "$PARTIAL" "$TAMPERED" -type f ! -name '*.age')"
fi

exit "$FAILED"
