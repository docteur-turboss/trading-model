#!/usr/bin/env bash
# Secret rotation script for trading-model
# Rotates: HMAC secrets, admin tokens
# Usage: bash scripts/rotate-secrets.sh [--component hmac|tokens|all]

set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
NAMESPACE=${NAMESPACE:-trading-model}

log() { echo "[rotate-secrets] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
warn() { echo "[rotate-secrets] WARN: $*" >&2; }

rotate_hmac_secret() {
  log "Rotating HMAC secret..."
  if $DRY_RUN; then
    log "[DRY-RUN] Would: generate new HMAC_SECRET and update sealed-secret"
    return
  fi

  local new_secret
  new_secret=$(openssl rand -hex 32)
  log "Generated new HMAC secret (${#new_secret} chars)"

  log "Updating sealed-secret for HMAC_SECRET..."
  kubectl create secret generic trading-model-secrets \
    --namespace "$NAMESPACE" \
    --from-literal=HMAC_SECRET="$new_secret" \
    --dry-run=client -o yaml | \
    kubeseal --namespace "$NAMESPACE" \
      --controller-namespace kube-system \
      --controller-name sealed-secrets \
      --merge-into - \
      -o yaml > /tmp/sealed-secret-temp.yaml

  kubectl apply -f /tmp/sealed-secret-temp.yaml
  rm -f /tmp/sealed-secret-temp.yaml

  log "HMAC secret rotated — restarting discovery-server to pick up new value..."
  kubectl rollout restart deployment/discovery-server -n "$NAMESPACE"
  kubectl rollout status deployment/discovery-server -n "$NAMESPACE" --timeout=120s
  log "HMAC secret rotation complete"
}

rotate_admin_tokens() {
  log "Rotating admin tokens..."
  if $DRY_RUN; then
    log "[DRY-RUN] Would: generate new AUTH_TOKENS and update sealed-secret"
    return
  fi

  local new_token
  new_token=$(openssl rand -hex 24)
  log "Generated new admin token"

  kubectl create secret generic trading-model-secrets \
    --namespace "$NAMESPACE" \
    --from-literal=AUTH_TOKENS="$new_token" \
    --from-literal=ADMIN_TOKEN="$new_token" \
    --dry-run=client -o yaml | \
    kubeseal --namespace "$NAMESPACE" \
      --controller-namespace kube-system \
      --controller-name sealed-secrets \
      --merge-into - \
      -o yaml > /tmp/sealed-secret-temp.yaml

  kubectl apply -f /tmp/sealed-secret-temp.yaml
  rm -f /tmp/sealed-secret-temp.yaml

  log "Admin tokens rotated — restarting api-gateway..."
  kubectl rollout restart deployment/api-gateway -n "$NAMESPACE"
  kubectl rollout status deployment/api-gateway -n "$NAMESPACE" --timeout=120s
  log "Admin token rotation complete"
}

COMPONENT="${1:-all}"

log "Starting secret rotation — component: ${COMPONENT}"

case "$COMPONENT" in
  hmac)
    rotate_hmac_secret
    ;;
  tokens)
    rotate_admin_tokens
    ;;
  all)
    rotate_hmac_secret
    rotate_admin_tokens
    ;;
  *)
    echo "Usage: $0 [--component hmac|tokens|all]"
    exit 1
    ;;
esac

log "Secret rotation complete"
