#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Check that backups have an encryption key and an off-site copy
#  Usage:  bash scripts/backup-config-check.sh --environment ENV --namespace NS
#          BACKUP_AGE_RECIPIENTS=... BACKUP_S3_BUCKET=... BACKUP_S3_SECONDARY_BUCKET=...
#
#  Run by deploy.yml before the overlay is applied (issue #331). Backups need
#  the public age keys (variable BACKUP_AGE_RECIPIENTS, or the ConfigMap
#  backup-encryption already in the namespace) and an off-site store (variable
#  BACKUP_S3_BUCKET, or the Secret trading-model-backup-s3 already there, e.g.
#  a SealedSecret). Without either the db-backup CronJob fails at its first run.
#  A second off-site bucket at another provider (BACKUP_S3_SECONDARY_BUCKET, or
#  that key in the Secret) is required too (ADR-0033); in production
#  BACKUP_S3_SECONDARY_CHECK=warn downgrades only its absence to a warning.
#  Production: `::error::` and exit 1. Elsewhere: `::warning::` and exit 0.
#  The checks are independent and both reported. Needs kubectl.
#  Exit codes: 0 compliant (or warned), 1 problem in production, 2 usage.
# =============================================================================

set -euo pipefail

ENVIRONMENT=""
NS=""
while [ $# -gt 0 ]; do
	case "$1" in
	--environment) ENVIRONMENT="${2:-}"; shift 2 ;;
	--namespace) NS="${2:-}"; shift 2 ;;
	-h | --help) sed -n 4,5p "$0" | sed 's/^#  //'; exit 0 ;;
	*) echo "::error::Unknown option: $1" >&2; exit 2 ;;
	esac
done
if [ -z "$ENVIRONMENT" ] || [ -z "$NS" ]; then
	echo "::error::--environment and --namespace are required" >&2
	exit 2
fi

problems=()
if [ -z "${BACKUP_AGE_RECIPIENTS:-}" ] &&
	! kubectl -n "$NS" get configmap backup-encryption >/dev/null 2>&1; then
	problems+=("BACKUP_AGE_RECIPIENTS is not set for ${ENVIRONMENT} and no backup-encryption ConfigMap exists in ${NS}: backups would be disabled")
fi
if [ -z "${BACKUP_S3_BUCKET:-}" ] &&
	! kubectl -n "$NS" get secret trading-model-backup-s3 >/dev/null 2>&1; then
	problems+=("BACKUP_S3_BUCKET is not set for ${ENVIRONMENT} and no trading-model-backup-s3 Secret exists in ${NS}: the backup job would fail until an off-site copy is configured")
fi
if [ -z "${BACKUP_S3_SECONDARY_BUCKET:-}" ] &&
	[ -z "$(kubectl -n "$NS" get secret trading-model-backup-s3 -o 'jsonpath={.data.BACKUP_S3_SECONDARY_BUCKET}' 2>/dev/null)" ]; then
	secondary="BACKUP_S3_SECONDARY_BUCKET is not set for ${ENVIRONMENT} and the trading-model-backup-s3 Secret in ${NS} has none: losing the only off-site provider loses every backup"
	if [ "$ENVIRONMENT" = production ] && [ "${BACKUP_S3_SECONDARY_CHECK:-}" = warn ]; then
		echo "::warning::BACKUP_S3_SECONDARY_CHECK=warn: ${secondary}. Set the second bucket, then remove the variable (docs/deployment/BACKUP_DR.md)"
	else
		problems+=("$secondary")
	fi
fi

if [ "${#problems[@]}" -eq 0 ]; then
	echo "✓ Backup encryption key and off-site copies are configured for ${ENVIRONMENT}"
	exit 0
fi
for problem in "${problems[@]}"; do
	if [ "$ENVIRONMENT" = production ]; then echo "::error::${problem}"; else echo "::warning::${problem}"; fi
done
[ "$ENVIRONMENT" != production ] || exit 1
exit 0
