#!/usr/bin/env bash
# Secret rotation script for trading-model
# Rotates: HMAC secrets, admin tokens
# Usage: bash scripts/rotate-secrets.sh [--component hmac|tokens|all]

set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
NAMESPACE=${NAMESPACE:-trading-model}
# Sealed Secrets controller installed by scripts/install-sealed-secrets.sh (ADR-0035).
CONTROLLER_NAMESPACE=${CONTROLLER_NAMESPACE:-sealed-secrets}
CONTROLLER_NAME=${CONTROLLER_NAME:-sealed-secrets-controller}

log() { echo "[rotate-secrets] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
warn() { echo "[rotate-secrets] WARN: $*" >&2; }

# $1 Secret key, $2 random bytes, $3 Deployment reading it, $4 label in the log,
# $5 optional prefix of the value (API key name and scopes)
rotate_secret() {
  local key="$1" bytes="$2" deployment="$3" label="$4" prefix="${5:-}"
  log "Rotating ${label}..."
  if $DRY_RUN; then
    log "[DRY-RUN] Would: generate new ${key} and update sealed-secret"
    return
  fi

  local new_value
  new_value="${prefix}$(openssl rand -hex "$bytes")"
  log "Generated new ${label}"

  kubectl create secret generic trading-model-secrets \
    --namespace "$NAMESPACE" \
    --from-literal="${key}=${new_value}" \
    --dry-run=client -o yaml | \
    kubeseal --namespace "$NAMESPACE" \
      --controller-namespace "$CONTROLLER_NAMESPACE" \
      --controller-name "$CONTROLLER_NAME" \
      --merge-into - \
      -o yaml > /tmp/sealed-secret-temp.yaml

  kubectl apply -f /tmp/sealed-secret-temp.yaml
  rm -f /tmp/sealed-secret-temp.yaml

  log "${label} rotated — restarting ${deployment}..."
  kubectl rollout restart "deployment/${deployment}" -n "$NAMESPACE"
  kubectl rollout status "deployment/${deployment}" -n "$NAMESPACE" --timeout=120s
  log "${label} rotation complete"
}

rotate_hmac_secret() { rotate_secret HMAC_SECRET 32 discovery-server "HMAC secret"; }
# Gateway API key `name:scopes:secret` (ADR-0059): one key, named API_KEY_NAME, with
# API_KEY_SCOPES (`read` only for a read-only key). It replaces every key of AUTH_TOKENS.
API_KEY_NAME=${API_KEY_NAME:-ops}
API_KEY_SCOPES=${API_KEY_SCOPES:-read+dlq:write}
rotate_admin_tokens() {
  rotate_secret AUTH_TOKENS 24 api-gateway "API key ${API_KEY_NAME}" "${API_KEY_NAME}:${API_KEY_SCOPES}:"
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
