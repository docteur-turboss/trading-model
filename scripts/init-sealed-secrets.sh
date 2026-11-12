#!/usr/bin/env bash
# =============================================================================
#  init-sealed-secrets.sh — Bootstrap the production SealedSecrets
#
#  Replaces the AgCHANGE_ME_RUN_KUBESEAL_Ag== placeholders in deploy/k8s/secrets/
#  with real, kubeseal-encrypted values. Run this once per cluster before the
#  production overlay can deploy (Mongo will not start without the encryption
#  key, and the app secrets are not decryptable until sealed).
#
#  Requires: kubectl, kubeseal, openssl. The sealed-secrets controller must be
#  installed by scripts/install-sealed-secrets.sh (namespace CONTROLLER_NAMESPACE,
#  default sealed-secrets, ADR-0035; Deployment and Service CONTROLLER_NAME,
#  default sealed-secrets-controller).
#
#  Usage:
#    bash scripts/init-sealed-secrets.sh               # generate random values + seal
#    bash scripts/init-sealed-secrets.sh --apply        # ... and kubectl apply
#    bash scripts/init-sealed-secrets.sh --dry-run      # print what would happen
#    OVERLAY=staging bash scripts/init-sealed-secrets.sh  # staging (namespace trading-model-staging)
#    OVERLAY=staging-local bash scripts/init-sealed-secrets.sh  # local kind staging (same namespace)
#
#  Override any value by exporting it, e.g.:
#    MYSQL_ROOT_PASSWORD='s3cret' bash scripts/init-sealed-secrets.sh
# =============================================================================

set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
APPLY=${APPLY:-false}
# OVERLAY=staging seals for trading-model-staging into the staging overlay
# (issue #417); the default targets production.
OVERLAY=${OVERLAY:-production}
case "$OVERLAY" in
  production) NAMESPACE=${NAMESPACE:-trading-model} ;;
  staging | staging-local) NAMESPACE=${NAMESPACE:-trading-model-staging} ;;
  *) echo "OVERLAY must be production, staging or staging-local" >&2; exit 1 ;;
esac
CONTROLLER_NAMESPACE=${CONTROLLER_NAMESPACE:-sealed-secrets}
CONTROLLER_NAME=${CONTROLLER_NAME:-sealed-secrets-controller}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [ "$OVERLAY" != production ]; then
  SEALED_FILE="${SCRIPT_DIR}/deploy/k8s/overlays/${OVERLAY}/sealed-secrets.yaml"
else
  SEALED_FILE="${SCRIPT_DIR}/deploy/k8s/secrets/trading-model-sealed-secrets.yaml"
fi

log() { echo "[init-sealed-secrets] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
warn() { echo "[init-sealed-secrets] WARN: $*" >&2; }

rand_hex() { openssl rand -hex "$1"; }

seal() {
  local plaintext_file="$1"
  local output_file="$2"
  if $DRY_RUN; then
    log "[DRY-RUN] Would seal ${plaintext_file} → ${output_file}"
    return
  fi
  kubeseal --namespace "$NAMESPACE" \
    --controller-namespace "$CONTROLLER_NAMESPACE" \
    --controller-name "$CONTROLLER_NAME" \
    --format yaml < "$plaintext_file" > "$output_file"
  log "Sealed ${output_file}"
}

main() {
  for arg in "$@"; do
    case "$arg" in
      --apply) APPLY=true ;;
      --dry-run) DRY_RUN=true ;;
      -n|--namespace)
        warn "--namespace must be passed as env NAMESPACE=...; ignoring"
        ;;
    esac
  done

  if $DRY_RUN; then
    log "DRY RUN — no files written, nothing applied"
  fi

  # Resolve values: env override or random.
  local AUTH_TOKENS SIGNING_SECRET SERVICE_BOOTSTRAP_TOKEN
  local MYSQL_ROOT_PASSWORD MYSQL_PASSWORD MYSQL_MIGRATE_PASSWORD MYSQL_RETENTION_PASSWORD MYSQL_EXPORTER_PASSWORD DLQ_AUTH_HMAC_SECRET
  local GRAFANA_PASSWORD
  local REDIS_INTERNAL_PASSWORD REDIS_DISCOVERY_PASSWORD REDIS_MESSAGE_MANAGER_PASSWORD REDIS_DLQ_PASSWORD REDIS_EXPORTER_PASSWORD
  local MONGO_ROOT_PASSWORD MONGO_EXPORTER_PASSWORD MONGO_BACKUP_PASSWORD MONGO_AUDIT_PASSWORD MONGO_DLQ_PASSWORD MONGO_AUDIT_KEYFILE MONGO_DLQ_KEYFILE
  # Gateway API key name:scopes:secret (ADR-0059).
  AUTH_TOKENS="${AUTH_TOKENS:-ops:read+dlq:write:$(rand_hex 24)}"
  SIGNING_SECRET="${SIGNING_SECRET:-$(rand_hex 32)}"
  SERVICE_BOOTSTRAP_TOKEN="${SERVICE_BOOTSTRAP_TOKEN:-$(rand_hex 24)}"
  MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-$(rand_hex 16)}"
  MYSQL_PASSWORD="${MYSQL_PASSWORD:-$(rand_hex 16)}"
  MYSQL_MIGRATE_PASSWORD="${MYSQL_MIGRATE_PASSWORD:-$(rand_hex 16)}"
  MYSQL_RETENTION_PASSWORD="${MYSQL_RETENTION_PASSWORD:-$(rand_hex 16)}"
  MYSQL_EXPORTER_PASSWORD="${MYSQL_EXPORTER_PASSWORD:-$(rand_hex 16)}"
  DLQ_AUTH_HMAC_SECRET="${DLQ_AUTH_HMAC_SECRET:-$(rand_hex 32)}"
  GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-$(rand_hex 16)}"
  REDIS_INTERNAL_PASSWORD="${REDIS_INTERNAL_PASSWORD:-$(rand_hex 24)}"
  REDIS_DISCOVERY_PASSWORD="${REDIS_DISCOVERY_PASSWORD:-$(rand_hex 24)}"
  REDIS_MESSAGE_MANAGER_PASSWORD="${REDIS_MESSAGE_MANAGER_PASSWORD:-$(rand_hex 24)}"
  REDIS_DLQ_PASSWORD="${REDIS_DLQ_PASSWORD:-$(rand_hex 24)}"
  REDIS_EXPORTER_PASSWORD="${REDIS_EXPORTER_PASSWORD:-$(rand_hex 24)}"
  MONGO_ROOT_PASSWORD="${MONGO_ROOT_PASSWORD:-$(rand_hex 24)}"
  MONGO_EXPORTER_PASSWORD="${MONGO_EXPORTER_PASSWORD:-$(rand_hex 24)}"
  MONGO_BACKUP_PASSWORD="${MONGO_BACKUP_PASSWORD:-$(rand_hex 24)}"
  MONGO_AUDIT_PASSWORD="${MONGO_AUDIT_PASSWORD:-$(rand_hex 24)}"
  MONGO_DLQ_PASSWORD="${MONGO_DLQ_PASSWORD:-$(rand_hex 24)}"
  MONGO_AUDIT_KEYFILE="${MONGO_AUDIT_KEYFILE:-$(rand_hex 64)}"
  MONGO_DLQ_KEYFILE="${MONGO_DLQ_KEYFILE:-$(rand_hex 64)}"

  if ! $DRY_RUN; then
    local plaintext_app="/tmp/trading-model-secrets-plaintext.yaml"
    cat > "$plaintext_app" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: trading-model-secrets
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/part-of: trading-model
type: Opaque
stringData:
  AUTH_TOKENS: "${AUTH_TOKENS}"
  SIGNING_SECRET: "${SIGNING_SECRET}"
  SERVICE_BOOTSTRAP_TOKEN: "${SERVICE_BOOTSTRAP_TOKEN}"
  MYSQL_ROOT_PASSWORD: "${MYSQL_ROOT_PASSWORD}"
  MYSQL_PASSWORD: "${MYSQL_PASSWORD}"
  MYSQL_MIGRATE_PASSWORD: "${MYSQL_MIGRATE_PASSWORD}"
  MYSQL_RETENTION_PASSWORD: "${MYSQL_RETENTION_PASSWORD}"
  MYSQL_EXPORTER_PASSWORD: "${MYSQL_EXPORTER_PASSWORD}"
  DLQ_AUTH_HMAC_SECRET: "${DLQ_AUTH_HMAC_SECRET}"
  GRAFANA_PASSWORD: "${GRAFANA_PASSWORD}"
  REDIS_INTERNAL_PASSWORD: "${REDIS_INTERNAL_PASSWORD}"
  REDIS_DISCOVERY_PASSWORD: "${REDIS_DISCOVERY_PASSWORD}"
  REDIS_MESSAGE_MANAGER_PASSWORD: "${REDIS_MESSAGE_MANAGER_PASSWORD}"
  REDIS_DLQ_PASSWORD: "${REDIS_DLQ_PASSWORD}"
  REDIS_EXPORTER_PASSWORD: "${REDIS_EXPORTER_PASSWORD}"
  MONGO_ROOT_PASSWORD: "${MONGO_ROOT_PASSWORD}"
  MONGO_EXPORTER_PASSWORD: "${MONGO_EXPORTER_PASSWORD}"
  MONGO_BACKUP_PASSWORD: "${MONGO_BACKUP_PASSWORD}"
  MONGO_AUDIT_PASSWORD: "${MONGO_AUDIT_PASSWORD}"
  MONGO_DLQ_PASSWORD: "${MONGO_DLQ_PASSWORD}"
  MONGO_AUDIT_KEYFILE: "${MONGO_AUDIT_KEYFILE}"
  MONGO_DLQ_KEYFILE: "${MONGO_DLQ_KEYFILE}"
EOF
    seal "$plaintext_app" "$SEALED_FILE"
    rm -f "$plaintext_app"
  fi

  if $APPLY && ! $DRY_RUN; then
    log "Applying sealed secrets to namespace ${NAMESPACE}..."
    kubectl apply -f "$SEALED_FILE"
    log "Applied — the sealed-secrets controller will decrypt it into the Secret."
  else
    log "Done. Inspect ${SEALED_FILE} and commit it (the deploy workflow applies it)"
  fi
}

main "$@"