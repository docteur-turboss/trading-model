#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Back up the SealedSecrets controller keys off-site
#  Usage:  bash scripts/backup-sealed-secrets-key.sh [--dest DIR]
#          BACKUP_AGE_RECIPIENTS="age1... age1..." BACKUP_S3_BUCKET=s3://bucket/prefix
#          AWS_* (+ RCLONE_S3_ENDPOINT / RCLONE_S3_PROVIDER), SEALED_SECRETS_NAMESPACE
#
#  The SealedSecrets committed in deploy/k8s/secrets/ only decrypt with the
#  private keys of the controller that sealed them, which live in the cluster
#  (Secrets labelled `sealedsecrets.bitnami.com/sealed-secrets-key` in the
#  controller namespace, SEALED_SECRETS_NAMESPACE, default kube-system). Lose
#  the cluster without them and no SealedSecret of the repository decrypts in
#  the new one (issue #328). This script exports EVERY key Secret (the
#  controller creates a new key every 30 days and keeps the old ones to
#  decrypt what they sealed), encrypts the export with age for
#  BACKUP_AGE_RECIPIENTS while it is written (no plaintext on disk), and copies
#  it to the off-site bucket of the database backups:
#    <BACKUP_S3_BUCKET>/sealed-secrets-key/sealed-secrets-key_<TIMESTAMP>.yaml.age
#  Restore: scripts/restore-sealed-secrets-key.sh (docs/deployment/sealed-secrets.md).
#
#  Run it after every `kubeseal --rotate`, every automatic key renewal and
#  every reinstall of the controller: a key created after the last backup is
#  lost with the cluster, and so are the secrets sealed with it.
#
#  The export only keeps what the controller needs (name, labels, type,
#  data): no uid, resourceVersion or owner, so it applies to a new cluster,
#  in any controller namespace. Encryption and the off-site copy are
#  mandatory: same rules as the backup CronJob (BACKUP_MIN_RECIPIENTS,
#  scripts/backup-lib.sh). --dest DIR also keeps the encrypted file in DIR,
#  once the off-site copy succeeded.
#  Exit 1, and no file left behind, when no key is found, kubectl or age
#  fails, or the off-site copy fails. Needs kubectl (with read access to the
#  Secrets of the controller namespace), age and rclone (or the aws CLI).
# =============================================================================

set -euo pipefail

DEST=""
NAMESPACE="${SEALED_SECRETS_NAMESPACE:-kube-system}"
KEY_LABEL="sealedsecrets.bitnami.com/sealed-secrets-key"
# UTC, like the database backups.
TIMESTAMP="$(date -u +%Y-%m-%d_%H%M%S)"

usage() {
	sed -n 4,6p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dest) DEST="${2:-}"; shift 2 ;;
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

# Key Secrets of the controller as a v1 List, reduced to what the controller
# reads. Data values are base64 (YAML-safe), label values quoted.
# shellcheck disable=SC2016
KEY_TEMPLATE='apiVersion: v1
kind: List
items:
{{- range .items}}
- apiVersion: v1
  kind: Secret
  type: {{.type}}
  metadata:
    name: {{.metadata.name}}
    labels:
{{- range $k, $v := .metadata.labels}}
      {{$k}}: {{printf "%q" $v}}
{{- end}}
  data:
{{- range $k, $v := .data}}
    {{$k}}: {{$v}}
{{- end}}
{{- end}}
'

# Unencrypted keys never leave the cluster.
export BACKUP_REQUIRE_ENCRYPTION=true BACKUP_REQUIRE_OFFSITE=true BACKUP_OFFSITE_LAYOUT=flat
if ! init_encryption; then
	exit 1
fi
if [ -z "${BACKUP_S3_BUCKET:-}" ]; then
	fail "BACKUP_S3_BUCKET is not set: the keys must leave the cluster (s3://bucket/prefix)"
	exit 1
fi
if ! command -v kubectl >/dev/null; then
	fail "kubectl is not installed"
	exit 1
fi

echo ""
echo "══════════════════════════════════════════════════"
echo "  Trading Model — SealedSecrets Key Backup"
echo "  Controller namespace: ${NAMESPACE}"
echo "  Bucket: ${BACKUP_S3_BUCKET:-(none)}"
echo "  Timestamp: ${TIMESTAMP}"
echo "══════════════════════════════════════════════════"
echo ""

if ! KEYS="$(kubectl -n "$NAMESPACE" get secret -l "$KEY_LABEL" -o name)"; then
	fail "Cannot list the Secrets of ${NAMESPACE}: wrong context or no read access"
	exit 1
fi
KEY_COUNT="$(grep -c . <<<"$KEYS" || true)"
if [ "$KEY_COUNT" -eq 0 ]; then
	fail "No Secret labelled ${KEY_LABEL} in ${NAMESPACE}: wrong namespace (SEALED_SECRETS_NAMESPACE) or controller never started"
	exit 1
fi
log "${KEY_COUNT} key(s): $(tr '\n' ' ' <<<"$KEYS")"

BACKUP_DIR="$(mktemp -d)"
trap 'rm -rf "$BACKUP_DIR"' EXIT
FILE="sealed-secrets-key/sealed-secrets-key_${TIMESTAMP}.yaml${AGE_SUFFIX}"
mkdir -p "$BACKUP_DIR/sealed-secrets-key"
export_keys() {
	kubectl -n "$NAMESPACE" get secret -l "$KEY_LABEL" -o go-template="$KEY_TEMPLATE"
}
if ! sealed_write "$BACKUP_DIR/$FILE" export_keys; then
	fail "Export or encryption of the keys failed: nothing written"
	exit 1
fi
ok "Keys exported and encrypted: ${FILE} ($(file_size "$BACKUP_DIR/$FILE") bytes)"

record_output "$BACKUP_DIR/$FILE"
upload_offsite
if [ "$BACKUP_FAILURES" -gt 0 ]; then
	fail "The keys are not off-site: run the script again once the bucket is reachable"
	exit 1
fi
if [ -n "$DEST" ]; then
	if ! mkdir -p "$DEST" || ! cp "$BACKUP_DIR/$FILE" "$DEST/"; then
		fail "The keys are off-site, but the copy to ${DEST} failed"
		exit 1
	fi
	ok "Encrypted copy kept in ${DEST}/$(basename "$FILE")"
fi
ok "SealedSecrets keys backed up to ${BACKUP_S3_BUCKET%/}/${FILE}"
