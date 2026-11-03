#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Check that the off-site backup bucket is immutable
#  Usage:  bash scripts/backup-bucket-check.sh --environment ENV [--bucket s3://bucket/prefix]
#            [--endpoint URL] [--min-days N] [--max-days N]
#          AWS_ACCESS_KEY_ID=... AWS_SECRET_ACCESS_KEY=... AWS_REGION=...
#          BACKUP_S3_IMMUTABILITY_CHECK=enforce|warn
#
#  The off-site copy is the only one left after the loss (or the compromise)
#  of the cluster, whose namespace holds the bucket's credentials. Only
#  Object Lock in compliance mode keeps an attacker holding those credentials,
#  or the account owner, from deleting the copies (ADR-0033, issue #326).
#  This script reads the bucket's Object Lock configuration
#  (`aws s3api get-object-lock-configuration`, with --endpoint for a non-AWS
#  store) and reports a problem when:
#    - no bucket is given (no off-site copy at all);
#    - the configuration cannot be read (Object Lock not enabled, provider
#      without Object Lock, credentials without
#      s3:GetBucketObjectLockConfiguration, store unreachable);
#    - Object Lock has no default retention (uploaded files are not locked);
#    - the default retention is not in COMPLIANCE mode (GOVERNANCE can be
#      bypassed by anyone granted s3:BypassGovernanceRetention);
#    - the default retention is shorter than --min-days (the daily backup
#      retention, RETENTION_DAYS, default 30): a copy could be deleted while
#      it is still one of the backups a restore relies on;
#    - the default retention is longer than --max-days (expiry of the
#      `daily/` lifecycle rule, default 31, ADR-0032): the daily copies of
#      the DLQ, checkpoints and SPIRE CA keys would outlive their 31 days
#      off-site (data minimisation), and the lifecycle rules could not expire
#      them on time.
#
#  BACKUP_S3_IMMUTABILITY_CHECK: `enforce` (default in production) turns a
#  problem into `::error::` and exit 1; `warn` (default elsewhere) into
#  `::warning::` and exit 0. Production can be downgraded to `warn` while the
#  bucket is being set up: the downgrade is itself reported as a warning.
#  There is no value that skips the check.
#  Exit codes: 0 compliant (or warned), 1 problem in enforce mode, 2 usage.
#  Needs the aws CLI and jq (both on GitHub-hosted runners).
# =============================================================================

set -euo pipefail

ENVIRONMENT=""
BUCKET=""
ENDPOINT=""
MIN_DAYS="${RETENTION_DAYS:-30}"
MAX_DAYS=31

usage() {
	sed -n 4,7p "$0" | sed 's/^#  //'
}

usage_error() {
	echo "::error::$*" >&2
	usage >&2
	exit 2
}

while [ $# -gt 0 ]; do
	case "$1" in
	--environment) ENVIRONMENT="${2:-}" && shift 2 ;;
	--bucket) BUCKET="${2:-}" && shift 2 ;;
	--endpoint) ENDPOINT="${2:-}" && shift 2 ;;
	--min-days) MIN_DAYS="${2:-}" && shift 2 ;;
	--max-days) MAX_DAYS="${2:-}" && shift 2 ;;
	-h | --help) usage && exit 0 ;;
	*) usage_error "Unknown argument: $1" ;;
	esac
done

[ -n "$ENVIRONMENT" ] || usage_error "--environment is required"
[[ "$MIN_DAYS" =~ ^[0-9]+$ ]] || usage_error "--min-days must be a number of days, not '${MIN_DAYS}'"
[[ "$MAX_DAYS" =~ ^[0-9]+$ ]] || usage_error "--max-days must be a number of days, not '${MAX_DAYS}'"
[ "$MIN_DAYS" -le "$MAX_DAYS" ] || usage_error "--min-days (${MIN_DAYS}) is greater than --max-days (${MAX_DAYS})"

MODE="${BACKUP_S3_IMMUTABILITY_CHECK:-}"
if [ -z "$MODE" ]; then
	if [ "$ENVIRONMENT" = production ]; then MODE=enforce; else MODE=warn; fi
fi
case "$MODE" in
enforce | warn) ;;
*) usage_error "BACKUP_S3_IMMUTABILITY_CHECK must be enforce or warn, not '${MODE}'" ;;
esac
if [ "$ENVIRONMENT" = production ] && [ "$MODE" = warn ]; then
	echo "::warning::BACKUP_S3_IMMUTABILITY_CHECK=warn: production deploys even if the off-site backup bucket is not immutable. Set up Object Lock, then remove the variable (docs/deployment/BACKUP_DR.md)"
fi

# Reports the problem `$1` and stops: exit 1 when enforced, 0 otherwise.
problem() {
	if [ "$MODE" = enforce ]; then
		echo "::error::$1 (docs/deployment/BACKUP_DR.md, Off-site immutability)"
		exit 1
	fi
	echo "::warning::$1 (docs/deployment/BACKUP_DR.md, Off-site immutability)"
	exit 0
}

if [ -z "$BUCKET" ]; then
	problem "No off-site backup bucket for ${ENVIRONMENT}: the backups have no copy outside the cluster"
fi
command -v aws >/dev/null || usage_error "the aws CLI is not installed"
command -v jq >/dev/null || usage_error "jq is not installed"

name="${BUCKET#s3://}"
name="${name%%/*}"
[ -n "$name" ] || usage_error "--bucket must be s3://bucket[/prefix], not '${BUCKET}'"

endpoint=()
[ -z "$ENDPOINT" ] || endpoint=(--endpoint-url "$ENDPOINT")
err="$(mktemp)"
trap 'rm -f "$err"' EXIT
if ! config="$(aws "${endpoint[@]}" s3api get-object-lock-configuration --bucket "$name" --output json 2>"$err")"; then
	reason="$(tr '\n' ' ' <"$err")"
	if grep -q 'ObjectLockConfigurationNotFoundError' "$err"; then
		problem "Bucket ${name} has no Object Lock: anyone holding its credentials can delete the off-site backups"
	fi
	problem "Object Lock configuration of bucket ${name} not readable (provider without Object Lock, credentials without s3:GetBucketObjectLockConfiguration, or store unreachable): ${reason}"
fi

if ! fields="$(jq -r '.ObjectLockConfiguration // {} |
	[.ObjectLockEnabled // "", .Rule.DefaultRetention.Mode // "",
	 (.Rule.DefaultRetention.Days // "" | tostring), (.Rule.DefaultRetention.Years // "" | tostring)] | @tsv' <<<"$config")"; then
	problem "Object Lock configuration of bucket ${name} is not the JSON S3 returns: ${config}"
fi
IFS=$'\t' read -r enabled mode days years <<<"$fields"

[ "$enabled" = Enabled ] ||
	problem "Bucket ${name} has no Object Lock: anyone holding its credentials can delete the off-site backups"
[ -n "$mode" ] ||
	problem "Bucket ${name} has Object Lock without default retention: the files the backup job uploads are not locked"
[ "$mode" = COMPLIANCE ] ||
	problem "Bucket ${name} locks in ${mode} mode, not COMPLIANCE: anyone granted s3:BypassGovernanceRetention can delete the off-site backups"

# S3 counts a retention year as 365 days.
if [ -n "$days" ]; then
	retention="$days"
elif [ -n "$years" ]; then
	retention=$((years * 365))
else
	problem "Bucket ${name} has a default retention without Days nor Years"
fi
[ "$retention" -ge "$MIN_DAYS" ] ||
	problem "Bucket ${name} locks files ${retention} days, less than the ${MIN_DAYS} days the backups are kept (RETENTION_DAYS)"
[ "$retention" -le "$MAX_DAYS" ] ||
	problem "Bucket ${name} locks files ${retention} days, more than the ${MAX_DAYS} days of the daily/ lifecycle rule: daily copies (DLQ, checkpoints, SPIRE CA keys) would outlive their retention (ADR-0032)"

echo "Bucket ${name}: Object Lock COMPLIANCE, default retention ${retention} days (${MIN_DAYS} to ${MAX_DAYS} expected)"
