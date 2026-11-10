#!/usr/bin/env bash
# Rotates application secrets of trading-model-secrets, by hand (no CronJob does it).
# Usage: bash scripts/rotate-secrets.sh [--component signing|tokens|dlq|all]
#   signing  SIGNING_SECRET        -> discovery-server (instance tokens: services re-register)
#   tokens   AUTH_TOKENS           -> api-gateway (one `name:scopes:secret` key, ADR-0059)
#   dlq      DLQ_AUTH_HMAC_SECRET  -> message-manager + dlq-service (restarted together)
#   all      the three above
# Database passwords (MYSQL_*, REDIS_*_PASSWORD) are refused: the change must also be made
# in the database, see docs/deployment/sealed-secrets.md "Rotate a database password".
# Env: DRY_RUN=true (no kubeseal merge, apply or restart), NAMESPACE, SEALED_SECRETS_FILE.
# The new value is merged into SEALED_SECRETS_FILE (kubeseal --merge-into), never printed.

set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
NAMESPACE=${NAMESPACE:-trading-model}
# Sealed Secrets controller installed by scripts/install-sealed-secrets.sh (ADR-0035).
CONTROLLER_NAMESPACE=${CONTROLLER_NAMESPACE:-sealed-secrets}
CONTROLLER_NAME=${CONTROLLER_NAME:-sealed-secrets-controller}
SEALED_SECRETS_FILE=${SEALED_SECRETS_FILE:-deploy/k8s/secrets/trading-model-sealed-secrets.yaml}
WAIT_TRIES=${WAIT_TRIES:-30}
# Gateway API key `name:scopes:secret` (ADR-0059); replaces every key of AUTH_TOKENS.
API_KEY_NAME=${API_KEY_NAME:-ops}
API_KEY_SCOPES=${API_KEY_SCOPES:-read+dlq:write}

log() { echo "[rotate-secrets] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
die() { echo "[rotate-secrets] ERROR: $*" >&2; exit 1; }

# $1 Secret key, $2 random bytes, $3 value prefix, rest: Deployments that read the key
rotate_secret() {
  local key="$1" bytes="$2" prefix="$3" deployment
  shift 3
  log "Rotating ${key} (restarts: $*)"
  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would: generate ${key}, merge into ${SEALED_SECRETS_FILE}, apply, restart $*"
    return
  fi

  local new_value b64
  new_value="${prefix}$(openssl rand -hex "$bytes")"
  # The Secret goes through the pipe only; kubeseal merges its key into the versioned file.
  kubectl create secret generic trading-model-secrets \
    --namespace "$NAMESPACE" \
    --from-literal="${key}=${new_value}" \
    --dry-run=client -o yaml |
    kubeseal --controller-namespace "$CONTROLLER_NAMESPACE" \
      --controller-name "$CONTROLLER_NAME" \
      --merge-into "$SEALED_SECRETS_FILE"
  kubectl apply -n "$NAMESPACE" -f "$SEALED_SECRETS_FILE"

  # Restarting before the controller decrypts would reload the old value.
  b64=$(printf '%s' "$new_value" | base64 | tr -d '\n')
  local i live=""
  for i in $(seq 1 "$WAIT_TRIES"); do
    live=$(kubectl get secret trading-model-secrets -n "$NAMESPACE" -o "jsonpath={.data.${key}}")
    [ "$live" = "$b64" ] && break
    sleep 2
  done
  [ "$live" = "$b64" ] || die "${key} not updated in the live Secret: the controller did not decrypt ${SEALED_SECRETS_FILE}"

  for deployment in "$@"; do
    kubectl rollout restart "deployment/${deployment}" -n "$NAMESPACE"
  done
  for deployment in "$@"; do
    kubectl rollout status "deployment/${deployment}" -n "$NAMESPACE" --timeout=120s
  done
  log "${key} rotated"
}

rotate_component() {
  case "$1" in
    signing) rotate_secret SIGNING_SECRET 32 "" discovery-server ;;
    tokens) rotate_secret AUTH_TOKENS 24 "${API_KEY_NAME}:${API_KEY_SCOPES}:" api-gateway ;;
    dlq) rotate_secret DLQ_AUTH_HMAC_SECRET 32 "" message-manager dlq-service ;;
    *) die "unknown component '$1'" ;;
  esac
}

COMPONENT=all
if [ $# -gt 0 ]; then
  [ "$1" = --component ] && [ $# -eq 2 ] || { echo "Usage: $0 [--component signing|tokens|dlq|all]" >&2; exit 1; }
  COMPONENT="$2"
fi

case "$COMPONENT" in
  signing | tokens | dlq) rotate_component "$COMPONENT" ;;
  all) for c in signing tokens dlq; do rotate_component "$c"; done ;;
  MYSQL_* | REDIS_* | mysql | redis)
    die "database passwords are not rotated by this script: follow 'Rotate a database password' in docs/deployment/sealed-secrets.md" ;;
  *) echo "Usage: $0 [--component signing|tokens|dlq|all]" >&2; exit 1 ;;
esac
log "Secret rotation complete"
