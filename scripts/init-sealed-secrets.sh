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
#  installed (controller-namespace defaults to kube-system).
#
#  Usage:
#    bash scripts/init-sealed-secrets.sh               # generate random values + seal
#    bash scripts/init-sealed-secrets.sh --apply        # ... and kubectl apply
#    bash scripts/init-sealed-secrets.sh --dry-run      # print what would happen
#
#  Override any value by exporting it, e.g.:
#    MYSQL_ROOT_PASSWORD='s3cret' bash scripts/init-sealed-secrets.sh
# =============================================================================

set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
APPLY=${APPLY:-false}
NAMESPACE=${NAMESPACE:-trading-model}
CONTROLLER_NAMESPACE=${CONTROLLER_NAMESPACE:-kube-system}
CONTROLLER_NAME=${CONTROLLER_NAME:-sealed-secrets}
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SEALED_DIR="${SCRIPT_DIR}/deploy/k8s/secrets"

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

  local secrets_dir="$SEALED_DIR"
  if $DRY_RUN; then
    log "DRY RUN — no files written, nothing applied"
  fi

  # Resolve values: env override or random.
  local AUTH_TOKENS SIGNING_SECRET SERVICE_BOOTSTRAP_TOKEN
  local MYSQL_ROOT_PASSWORD MYSQL_PASSWORD DLQ_AUTH_HMAC_SECRET
  local ADMIN_TOKEN GRAFANA_PASSWORD HMAC_SECRET MONGO_ENC_KEY
  AUTH_TOKENS="${AUTH_TOKENS:-$(rand_hex 24)}"
  SIGNING_SECRET="${SIGNING_SECRET:-$(rand_hex 32)}"
  SERVICE_BOOTSTRAP_TOKEN="${SERVICE_BOOTSTRAP_TOKEN:-$(rand_hex 24)}"
  MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-$(rand_hex 16)}"
  MYSQL_PASSWORD="${MYSQL_PASSWORD:-$(rand_hex 16)}"
  DLQ_AUTH_HMAC_SECRET="${DLQ_AUTH_HMAC_SECRET:-$(rand_hex 32)}"
  ADMIN_TOKEN="${ADMIN_TOKEN:-$(rand_hex 24)}"
  GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-$(rand_hex 16)}"
  HMAC_SECRET="${HMAC_SECRET:-$(rand_hex 32)}"
  MONGO_ENC_KEY="${MONGO_ENC_KEY:-$(rand_hex 32)}" # 64-char hex AES key (required by Mongo)

  if ! $DRY_RUN; then
    local plaintext_app="/tmp/trading-model-secrets-plaintext.yaml"
    local plaintext_mongo="/tmp/mongodb-encryption-key-plaintext.yaml"
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
  DLQ_AUTH_HMAC_SECRET: "${DLQ_AUTH_HMAC_SECRET}"
  ADMIN_TOKEN: "${ADMIN_TOKEN}"
  GRAFANA_PASSWORD: "${GRAFANA_PASSWORD}"
  HMAC_SECRET: "${HMAC_SECRET}"
EOF
    cat > "$plaintext_mongo" <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: mongodb-encryption-key
  namespace: ${NAMESPACE}
  labels:
    app.kubernetes.io/part-of: trading-model
type: Opaque
stringData:
  key: "${MONGO_ENC_KEY}"
EOF
    seal "$plaintext_app" "$secrets_dir/trading-model-sealed-secrets.yaml"
    seal "$plaintext_mongo" "$secrets_dir/mongodb-encryption-key-sealed.yaml"
    rm -f "$plaintext_app" "$plaintext_mongo"
  fi

  if $APPLY && ! $DRY_RUN; then
    log "Applying sealed secrets to namespace ${NAMESPACE}..."
    kubectl apply -f "$secrets_dir/trading-model-sealed-secrets.yaml"
    kubectl apply -f "$secrets_dir/mongodb-encryption-key-sealed.yaml"
    log "Applied — the sealed-secrets controller will decrypt them into Secrets."
  else
    log "Done. Inspect deploy/k8s/secrets/*-sealed.yaml and apply with: kubectl apply -k deploy/k8s/secrets"
  fi
}

main "$@"