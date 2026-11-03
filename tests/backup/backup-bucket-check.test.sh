#!/usr/bin/env bash
# Immutability check of the off-site backup bucket (scripts/backup-bucket-check.sh,
# ADR-0033, issue #326), off any cluster: a stub `aws` CLI answers
# get-object-lock-configuration the way S3 does (JSON on stdout, error text on
# stderr and exit 254) and records its arguments. Checks the exit code and the
# GitHub annotation for compliant, absent, governance, too short and too long
# retentions, in production (error) and staging (warning), and the
# BACKUP_S3_IMMUTABILITY_CHECK fallback. Needs jq.
#   bash tests/backup/backup-bucket-check.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK="$ROOT/scripts/backup-bucket-check.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "  ✓ $*"; }
failed() {
	echo "  ✗ $*"
	FAILED=1
}

mkdir -p "$WORK/bin"
cat >"$WORK/bin/aws" <<'STUB'
#!/usr/bin/env bash
# Stub of the aws CLI: records its arguments, prints $STUB_STDOUT, $STUB_STDERR
# and exits $STUB_EXIT.
printf '%s\n' "$*" >>"$STUB_LOG"
[ -z "${STUB_STDOUT:-}" ] || printf '%s\n' "$STUB_STDOUT"
[ -z "${STUB_STDERR:-}" ] || printf '%s\n' "$STUB_STDERR" >&2
exit "${STUB_EXIT:-0}"
STUB
chmod +x "$WORK/bin/aws"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/aws.log"

lock() { # <mode> <unit> <value>
	printf '{"ObjectLockConfiguration":{"ObjectLockEnabled":"Enabled","Rule":{"DefaultRetention":{"Mode":"%s","%s":%s}}}}' "$1" "$2" "$3"
}
NOT_FOUND='An error occurred (ObjectLockConfigurationNotFoundError) when calling the GetObjectLockConfiguration operation: Object Lock configuration does not exist for this bucket'
NOT_IMPLEMENTED='An error occurred (NotImplemented) when calling the GetObjectLockConfiguration operation: A header you provided implies functionality that is not implemented'

# Output of the script under test, indented under its failure.
indent() {
	local line
	while IFS= read -r line; do echo "      $line"; done <<<"$1"
}

# expect <name> <exit> <annotation: error|warning|none> <environment> [script args...]
# Uses STUB_STDOUT / STUB_STDERR / STUB_EXIT / BACKUP_S3_IMMUTABILITY_CHECK as set.
expect() {
	local name="$1" want_exit="$2" want_note="$3" env="$4" out code=0
	shift 4
	: >"$STUB_LOG"
	out="$(bash "$CHECK" --environment "$env" "$@" 2>&1)" || code=$?
	if [ "$code" -ne "$want_exit" ]; then
		failed "$name: exit $code, expected $want_exit"
		indent "$out"
		return
	fi
	case "$want_note" in
	error | warning)
		if ! grep -q "^::${want_note}::" <<<"$out"; then
			failed "$name: no ::${want_note}:: annotation"
			indent "$out"
			return
		fi
		;;
	none)
		if grep -qE '^::(error|warning)::' <<<"$out"; then
			failed "$name: unexpected annotation"
			indent "$out"
			return
		fi
		;;
	esac
	pass "$name"
}

BUCKET=(--bucket s3://trading-backups/prod)

echo "Compliant bucket"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 30)" \
	expect "COMPLIANCE 30 days, production: passes" 0 none production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 31)" \
	expect "COMPLIANCE 31 days (daily/ lifecycle expiry), production: passes" 0 none production "${BUCKET[@]}"
if grep -q -- '--bucket trading-backups --output json' "$STUB_LOG" && ! grep -q -- '--endpoint-url' "$STUB_LOG"; then
	pass "reads the bucket name without the prefix, no endpoint for AWS"
else
	failed "unexpected aws call: $(cat "$STUB_LOG")"
fi
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 30)" \
	expect "S3-compatible store: passes" 0 none production "${BUCKET[@]}" --endpoint https://s3.fr-par.scw.cloud
if grep -q -- '--endpoint-url https://s3.fr-par.scw.cloud s3api get-object-lock-configuration' "$STUB_LOG"; then
	pass "passes the endpoint to the aws CLI"
else
	failed "endpoint not passed: $(cat "$STUB_LOG")"
fi
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 45)" RETENTION_DAYS=45 \
	expect "RETENTION_DAYS=45, 45-day lock: passes (with --max-days)" 0 none production "${BUCKET[@]}" --max-days 46
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 40)" RETENTION_DAYS=45 \
	expect "RETENTION_DAYS=45, 40-day lock: error" 1 error production "${BUCKET[@]}" --max-days 46

echo "No Object Lock"
STUB_EXIT=254 STUB_STDOUT="" STUB_STDERR="$NOT_FOUND" \
	expect "absent, production: error" 1 error production "${BUCKET[@]}"
STUB_EXIT=254 STUB_STDOUT="" STUB_STDERR="$NOT_FOUND" \
	expect "absent, staging: warning" 0 warning staging "${BUCKET[@]}"
STUB_EXIT=254 STUB_STDOUT="" STUB_STDERR="$NOT_IMPLEMENTED" \
	expect "provider without Object Lock, production: error" 1 error production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT='{"ObjectLockConfiguration":{"ObjectLockEnabled":"Enabled"}}' \
	expect "enabled without default retention, production: error" 1 error production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT='not json' \
	expect "unreadable answer, production: error" 1 error production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="" \
	expect "no bucket, production: error" 1 error production
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="" \
	expect "no bucket, staging: warning" 0 warning staging

echo "Governance, too short, too long"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock GOVERNANCE Days 30)" \
	expect "GOVERNANCE, production: error" 1 error production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock GOVERNANCE Days 30)" \
	expect "GOVERNANCE, staging: warning" 0 warning staging "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 7)" \
	expect "COMPLIANCE 7 days (< RETENTION_DAYS), production: error" 1 error production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Years 1)" \
	expect "COMPLIANCE 1 year (> daily/ expiry), production: error" 1 error production "${BUCKET[@]}"

echo "Fallback variable"
STUB_EXIT=254 STUB_STDOUT="" STUB_STDERR="$NOT_FOUND" BACKUP_S3_IMMUTABILITY_CHECK=warn \
	expect "production downgraded to warn: warning, exit 0" 0 warning production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock GOVERNANCE Days 30)" BACKUP_S3_IMMUTABILITY_CHECK=enforce \
	expect "staging raised to enforce: error" 1 error staging "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 30)" BACKUP_S3_IMMUTABILITY_CHECK=off \
	expect "no value disables the check (off refused)" 2 error production "${BUCKET[@]}"
STUB_EXIT=0 STUB_STDERR="" STUB_STDOUT="$(lock COMPLIANCE Days 30)" \
	expect "--min-days above --max-days refused" 2 error production "${BUCKET[@]}" --min-days 40

if [ "$FAILED" -ne 0 ]; then
	echo "FAILED"
	exit 1
fi
echo "All off-site bucket checks passed"
