#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Restore the SealedSecrets controller keys into a cluster
#  Usage:  bash scripts/restore-sealed-secrets-key.sh --identity KEY_FILE [--file FILE | --offsite [--timestamp TS]]
#          --offsite (default): BACKUP_S3_BUCKET + AWS_* (+ RCLONE_S3_*), as scripts/fetch-offsite.sh
#          SEALED_SECRETS_NAMESPACE (default sealed-secrets), SEALED_SECRETS_CONTROLLER
#
#  Puts back the keys saved by scripts/backup-sealed-secrets-key.sh, so that
#  the SealedSecrets of deploy/k8s/secrets/ decrypt in a new cluster (issue
#  #328). Step of the total outage recovery, before the manifests are deployed
#  (docs/deployment/BACKUP_DR.md).
#
#  Source of the keys:
#    --offsite (default)  the newest `sealed-secrets-key_<TS>.yaml.age` of
#                         <BACKUP_S3_BUCKET>/sealed-secrets-key/ (or --timestamp
#                         TS), fetched still encrypted into a temporary
#                         directory removed on exit
#    --file FILE          an encrypted export already on disk
#  The file is decrypted with KEY_FILE (an age identity: the operator key or
#  the escrow key, ENCRYPTION_AT_REST.md "Key custody") straight into
#  `kubectl apply`: no plaintext on disk. It is decrypted once before anything
#  is applied, so a wrong key or a corrupt file changes nothing.
#
#  Order: run it BEFORE installing the controller (it then starts with the
#  restored keys), or after: the controller Deployment
#  (SEALED_SECRETS_CONTROLLER, default sealed-secrets-controller) is then
#  restarted, since it only reads its keys at startup. The namespace is
#  created when missing. Exit 1 when no file is found, it does not decrypt or
#  holds no key, kubectl fails, a restored key is not found by name afterwards,
#  or the restarted controller does not become ready. Needs kubectl, age (and
#  rclone for --offsite).
# =============================================================================

set -euo pipefail

IDENTITY=""
FILE=""
OFFSITE=false
TIMESTAMP=""
NAMESPACE="${SEALED_SECRETS_NAMESPACE:-sealed-secrets}"
CONTROLLER="${SEALED_SECRETS_CONTROLLER:-sealed-secrets-controller}"
KEY_LABEL="sealedsecrets.bitnami.com/sealed-secrets-key"

usage() {
	sed -n 4,6p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--identity) IDENTITY="${2:-}"; shift 2 ;;
	--file) FILE="${2:-}"; shift 2 ;;
	--offsite) OFFSITE=true; shift ;;
	--timestamp) TIMESTAMP="${2:-}"; shift 2 ;;
	-h | --help) usage; exit 0 ;;
	*) echo "Unknown option: $1"; usage; exit 1 ;;
	esac
done

log() { echo "[$(date +%H:%M:%S)] $*"; }
ok() { log "✓ $*"; }
fail() { log "✗ $*"; }
warn() { log "⚠ $*"; }

# shellcheck source=backup-lib.sh
source "$(dirname "$0")/backup-lib.sh"

if [ -z "$IDENTITY" ]; then
	fail "--identity is required: the age private key file that decrypts the backups"
	exit 1
fi
if [ ! -f "$IDENTITY" ] || [ ! -r "$IDENTITY" ]; then
	fail "--identity ${IDENTITY} is not a readable file"
	exit 1
fi
if [ -n "$FILE" ] && $OFFSITE; then
	fail "--file and --offsite are exclusive"
	exit 1
fi
if [ -n "$FILE" ] && [ -n "$TIMESTAMP" ]; then
	fail "--timestamp picks a file of the bucket: it does not apply to --file"
	exit 1
fi
if [ -n "$TIMESTAMP" ] && ! [[ "$TIMESTAMP" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}$ ]]; then
	fail "--timestamp ${TIMESTAMP} is not a backup timestamp (YYYY-MM-DD_HHMMSS)"
	exit 1
fi
for tool in kubectl age; do
	if ! command -v "$tool" >/dev/null; then
		fail "${tool} is not installed"
		exit 1
	fi
done

if [ -z "$FILE" ]; then
	BUCKET="${BACKUP_S3_BUCKET:-}"
	if [ -z "$BUCKET" ]; then
		fail "BACKUP_S3_BUCKET is not set: the off-site bucket to fetch the keys from (s3://bucket/prefix), or use --file"
		exit 1
	fi
	if ! command -v rclone >/dev/null; then
		fail "rclone is not installed"
		exit 1
	fi
	export RCLONE_S3_ENV_AUTH=true
	REMOTE="$(offsite_remote "${BUCKET%/}/sealed-secrets-key")"
	if ! LISTING="$(rclone lsf --files-only "$REMOTE")"; then
		fail "Cannot list ${BUCKET%/}/sealed-secrets-key: unreachable, wrong credentials (AWS_*) or RCLONE_S3_ENDPOINT"
		exit 1
	fi
	# Timestamps are UTC YYYY-MM-DD_HHMMSS: the name order is the time order.
	NAMES="$(grep -E '^sealed-secrets-key_[0-9]{4}-[0-9]{2}-[0-9]{2}_[0-9]{6}\.yaml\.age$' <<<"$LISTING" | sort || true)"
	if [ -n "$TIMESTAMP" ]; then
		NAME="$(grep -xF "sealed-secrets-key_${TIMESTAMP}.yaml.age" <<<"$NAMES" || true)"
	else
		NAME="$(tail -1 <<<"$NAMES")"
	fi
	if [ -z "$NAME" ]; then
		fail "No sealed-secrets-key_${TIMESTAMP:-<TS>}.yaml.age in ${BUCKET%/}/sealed-secrets-key: run scripts/backup-sealed-secrets-key.sh on the old cluster, or reseal every secret (docs/deployment/sealed-secrets.md)"
		exit 1
	fi
	WORK="$(mktemp -d)"
	trap 'rm -rf "$WORK"' EXIT
	if ! rclone copyto "${REMOTE}/${NAME}" "$WORK/$NAME"; then
		fail "Cannot fetch ${NAME}"
		exit 1
	fi
	FILE="$WORK/$NAME"
	ok "Fetched ${BUCKET%/}/sealed-secrets-key/${NAME}"
fi
if [ ! -s "$FILE" ]; then
	fail "${FILE} is missing or empty"
	exit 1
fi

# Decrypted once before anything is applied: a wrong key changes nothing.
# Only the key names are kept (no secret material).
if ! KEY_NAMES="$(age -d -i "$IDENTITY" "$FILE" | sed -n 's/^    name: //p')" || [ -z "$KEY_NAMES" ]; then
	fail "${FILE} does not decrypt with ${IDENTITY} or holds no key: nothing restored (try the other key, ENCRYPTION_AT_REST.md)"
	exit 1
fi
KEY_COUNT="$(grep -c . <<<"$KEY_NAMES")"
log "${FILE} holds ${KEY_COUNT} key(s)"

if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
	if ! kubectl create namespace "$NAMESPACE"; then
		fail "Cannot create the namespace ${NAMESPACE}"
		exit 1
	fi
fi
if ! age -d -i "$IDENTITY" "$FILE" | kubectl -n "$NAMESPACE" apply -f -; then
	fail "kubectl apply of the keys failed in ${NAMESPACE}"
	exit 1
fi
# Checked by name, not by count: a controller started before the restore
# holds a key of its own, which would hide a key missing from the apply.
if ! FOUND="$(kubectl -n "$NAMESPACE" get secret -l "$KEY_LABEL" -o name)"; then
	fail "Cannot list the key Secrets of ${NAMESPACE} after the restore"
	exit 1
fi
MISSING=""
while read -r name; do
	grep -qxF "secret/${name}" <<<"$FOUND" || MISSING="${MISSING} ${name}"
done <<<"$KEY_NAMES"
if [ -n "$MISSING" ]; then
	fail "Key Secret(s) missing in ${NAMESPACE} after the restore:${MISSING}"
	exit 1
fi
ok "${KEY_COUNT} key(s) restored in ${NAMESPACE}"

if kubectl -n "$NAMESPACE" get deployment "$CONTROLLER" >/dev/null 2>&1; then
	# The controller loads its keys at startup only.
	log "Restarting ${NAMESPACE}/${CONTROLLER} so that it loads the restored keys"
	if ! kubectl -n "$NAMESPACE" rollout restart deployment "$CONTROLLER" ||
		! kubectl -n "$NAMESPACE" rollout status deployment "$CONTROLLER" --timeout=180s; then
		fail "${NAMESPACE}/${CONTROLLER} did not restart: the SealedSecrets will not decrypt until it runs with the restored keys"
		exit 1
	fi
	ok "${CONTROLLER} restarted"
else
	log "No deployment ${NAMESPACE}/${CONTROLLER}: install the controller now (docs/deployment/sealed-secrets.md), it will start with the restored keys"
fi
warn "Back up the keys of this cluster once the controller runs (scripts/backup-sealed-secrets-key.sh): a controller started before the restore created a key of its own"
