#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Check the age recipients the backups are encrypted for
#  Usage:  bash scripts/backup-recipients-check.sh --environment ENV [--min N]
#          BACKUP_AGE_RECIPIENTS="age1... age1..."
#
#  Run by deploy.yml before the overlay is applied (issue #327). Every backup
#  is readable only with the private key of one of its recipients: with a
#  single recipient, losing that key (or a wrong value of the variable) makes
#  every backup unreadable, and nobody notices before the restore. Production
#  therefore needs at least two distinct `age1…` keys: the operator key and
#  the escrow key (docs/deployment/ENCRYPTION_AT_REST.md, "Key custody").
#
#  The minimum is the larger of --min (deploy.yml passes the
#  BACKUP_MIN_RECIPIENTS the overlay gives the backup CronJobs) and the floor
#  of the environment: 2 in production, 1 elsewhere. A problem is an
#  `::error::` and exit 1 in production, a `::warning::` and exit 0 elsewhere
#  (the CronJob refuses to run anyway: init_encryption, scripts/backup-lib.sh).
#  Problems: a recipient that is not an X25519 `age1…` public key (an SSH key
#  holds a space: it cannot be listed in this variable), fewer distinct keys
#  than the minimum (a key listed twice counts once).
#  Exit codes: 0 compliant (or warned), 1 problem in production, 2 usage.
#  Needs bash only (no age binary on the runner: the format is checked here,
#  the key itself by init_encryption in the CronJob).
# =============================================================================

set -euo pipefail

ENVIRONMENT=""
MIN=1

usage() {
	sed -n 4,5p "$0" | sed 's/^#  //'
}

usage_error() {
	echo "::error::$*" >&2
	usage >&2
	exit 2
}

while [ $# -gt 0 ]; do
	case "$1" in
	--environment) ENVIRONMENT="${2:-}"; shift 2 ;;
	--min) MIN="${2:-}"; shift 2 ;;
	-h | --help) usage; exit 0 ;;
	*) usage_error "Unknown option: $1" ;;
	esac
done

[ -n "$ENVIRONMENT" ] || usage_error "--environment is required"

log() { echo "$*"; }
fail() { echo "::error::$*"; }
warn() { echo "::warning::$*"; }
# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

valid_min_recipients "$MIN" || usage_error "--min ${MIN} is not a positive integer"
FLOOR=1
[ "$ENVIRONMENT" != production ] || FLOOR=2
[ "$MIN" -ge "$FLOOR" ] || MIN="$FLOOR"

# X25519 recipient: `age1` + 58 bech32 characters.
AGE_KEY_RE='^age1[02-9ac-hj-np-z]{58}$'

problems=()
count=0
while read -r recipient; do
	[ -n "$recipient" ] || continue
	if [[ "$recipient" =~ $AGE_KEY_RE ]]; then
		count=$((count + 1))
	else
		problems+=("BACKUP_AGE_RECIPIENTS holds '${recipient}', which is not an age1… public key")
	fi
done < <(distinct_recipients)
if [ "$count" -lt "$MIN" ]; then
	problems+=("BACKUP_AGE_RECIPIENTS holds ${count} distinct age1… key(s), ${ENVIRONMENT} needs at least ${MIN} (operator key + escrow key, docs/deployment/ENCRYPTION_AT_REST.md \"Key custody\")")
fi

if [ "${#problems[@]}" -eq 0 ]; then
	ok "Backups encrypted for ${count} distinct age recipient(s) (minimum ${MIN} in ${ENVIRONMENT})"
	exit 0
fi
for problem in "${problems[@]}"; do
	if [ "$ENVIRONMENT" = production ]; then fail "$problem"; else warn "$problem"; fi
done
[ "$ENVIRONMENT" != production ] || exit 1
exit 0
