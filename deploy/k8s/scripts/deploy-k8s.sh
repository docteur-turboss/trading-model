#!/usr/bin/env bash
# =============================================================================
#  deploy-k8s.sh — Kubernetes Deployment Script for Trading Model
#  Usage:
#    ./deploy-k8s.sh [-n <namespace>] apply           # Apply all manifests
#    ./deploy-k8s.sh [-n <namespace>] apply <service> # Apply a single service
#    ./deploy-k8s.sh [-n <namespace>] delete          # Delete all resources
#    ./deploy-k8s.sh [-n <namespace>] status          # Show deployment status
#    ./deploy-k8s.sh [-n <namespace>] rollback <service> [revision]
#    ./deploy-k8s.sh [-n <namespace>] canary <service> [image-tag] [percentage]
#    ./deploy-k8s.sh [-n <namespace>] smoke-test      # Run smoke tests
#  Namespace: K8S_NAMESPACE env or -n/--namespace (default: trading-model)
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="${SCRIPT_DIR}"
NAMESPACE="${K8S_NAMESPACE:-trading-model}"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; }

# Feature flags: enable individual capabilities with the FEATURE_FLAGS env var
# (comma-separated), e.g. FEATURE_FLAGS="canary-auto-cleanup". Flags are additive
# and default to off so deploys stay predictable unless explicitly opted in.
feature_enabled() {
  local flag="$1"
  [[ -n "${FEATURE_FLAGS:-}" && ",${FEATURE_FLAGS}," == *",${flag},"* ]]
}

# Resolve a container image reference (repo:tag) to an immutable @sha256 digest.
# Uses crane when available, falling back to docker buildx imagetools inspect.
resolve_image_digest() {
  local repo="$1" tag="$2"
  if command -v crane &>/dev/null; then
    local digest
    if digest="$(crane digest "$repo:$tag" 2>/dev/null)"; then
      echo "$digest"
      return 0
    fi
  fi
  if command -v docker &>/dev/null; then
    local digest
    if digest="$(docker buildx imagetools inspect "$repo:$tag" --format '{{.Manifest.Digest}}' 2>/dev/null)"; then
      echo "$digest"
      return 0
    fi
  fi
  return 1
}

check_prereqs() {
  if ! command -v kubectl &>/dev/null; then
    err "kubectl is required. Install: https://kubernetes.io/docs/tasks/tools/"
    exit 1
  fi
  if ! kubectl cluster-info &>/dev/null; then
    err "Cannot connect to Kubernetes cluster. Check your kubeconfig."
    exit 1
  fi
}

cmd_apply() {
  local service="${1:-}"

  if [[ -n "$service" ]]; then
    log "Applying manifests for service: $service"
    kubectl apply -n "$NAMESPACE" -f "${K8S_DIR}/config/${service}-configmap.yaml" 2>/dev/null || true
    kubectl apply -n "$NAMESPACE" -f "${K8S_DIR}/services/${service}.yaml" 2>/dev/null || true
  else
    log "Applying all Trading Model manifests..."
    kubectl apply -k "${K8S_DIR}/"
  fi

  log "Deployment applied. Waiting for rollouts..."

  if [[ -n "$service" ]]; then
    kubectl rollout status -n "$NAMESPACE" "deployment/${service}" --timeout=120s
  else
    for dep in discovery-server message-manager financial-scraper trader-trainer \
               api-gateway audit-logger dlq-service admin-interface; do
      kubectl rollout status -n "$NAMESPACE" "deployment/${dep}" --timeout=120s 2>/dev/null || \
        log "Warning: $dep rollout status check failed (may not exist)"
    done
  fi

  log "Deployment complete."
}

cmd_delete() {
  local service="${1:-}"
  if [[ -n "$service" ]]; then
    log "Deleting service: $service"
    kubectl delete -n "$NAMESPACE" "deployment/${service}" --ignore-not-found
    kubectl delete -n "$NAMESPACE" "service/${service}" --ignore-not-found
  else
    log "Deleting all Trading Model resources..."
    kubectl delete -k "${K8S_DIR}/" --ignore-not-found
  fi
  log "Deletion complete."
}

cmd_status() {
  log "=== Pod Status ==="
  kubectl get pods -n "$NAMESPACE" -o wide

  log ""
  log "=== Service Status ==="
  kubectl get services -n "$NAMESPACE"

  log ""
  log "=== HPA Status ==="
  kubectl get hpa -n "$NAMESPACE"

  log ""
  log "=== PDB Status ==="
  kubectl get pdb -n "$NAMESPACE"

  log ""
  log "=== Ingress Status ==="
  kubectl get ingress -n "$NAMESPACE"
}

cmd_rollback() {
  local service="$1"
  local revision="${2:-}"

  if [[ -z "$service" ]]; then
    err "Usage: $0 rollback <service> [revision]"
    exit 1
  fi

  if [[ -n "$revision" ]]; then
    log "Rolling back $service to revision $revision..."
    kubectl rollout undo -n "$NAMESPACE" "deployment/${service}" --to-revision="$revision"
  else
    log "Rolling back $service to previous revision..."
    kubectl rollout undo -n "$NAMESPACE" "deployment/${service}"
  fi

  kubectl rollout status -n "$NAMESPACE" "deployment/${service}" --timeout=120s
  log "Rollback of $service complete."
}

cmd_canary() {
  local service="${1:-}"
  local image_tag="${2:-}"
  local percentage="${3:-10}"

  if [[ -z "$service" ]]; then
    err "Usage: $0 canary <service> [image-tag] [percentage]"
    exit 1
  fi
  if ! command -v jq &>/dev/null; then
    err "jq is required for canary deployments. Install jq."
    exit 1
  fi

  local canary_name="${service}-canary"
  local total_replicas
  total_replicas=$(kubectl get deployment -n "$NAMESPACE" "$service" -o jsonpath='{.spec.replicas}' 2>/dev/null || true)
  if [[ -z "$total_replicas" || "$total_replicas" -lt 1 ]]; then
    err "Cannot read replica count of deployment $service in namespace $NAMESPACE"
    exit 1
  fi
  local canary_replicas=$(( total_replicas * percentage / 100 ))
  [[ "$canary_replicas" -lt 1 ]] && canary_replicas=1

  local traffic_share=$(( canary_replicas * 100 / (total_replicas + canary_replicas) ))
  log "Creating canary $canary_name for $service ($canary_replicas replicas, ~${traffic_share}% of traffic)"

  # Prefer an immutable @sha256 digest over a mutable tag when an image is given.
  local image_ref="${image_tag:-}"
  if [[ -n "$image_ref" ]]; then
    local digest
    if digest="$(resolve_image_digest "${CANARY_IMAGE_REPO:-ghcr.io/trading-model}/${service}" "$image_ref")"; then
      image_ref="@${digest}"
      log "Pinned ${service} canary image to digest ${digest}"
    else
      log "WARNING: could not resolve a digest for ${service}:${image_tag} — falling back to tag"
    fi
  fi

  kubectl get deployment -n "$NAMESPACE" "$service" -o json \
    | jq --arg name "$canary_name" --arg component "$service" \
         --arg replicas "$canary_replicas" --arg ref "$image_ref" '
        .metadata.name = $name |
        .metadata.resourceVersion = null |
        .metadata.uid = null |
        .metadata.creationTimestamp = null |
        del(.status) |
        .spec.selector.matchLabels["app.kubernetes.io/component"] = $component |
        .spec.selector.matchLabels["track"] = "canary" |
        .spec.template.metadata.labels["app.kubernetes.io/component"] = $component |
        .spec.template.metadata.labels["track"] = "canary" |
        .spec.replicas = ($replicas | tonumber) |
        .spec.strategy = { "type": "RollingUpdate", "rollingUpdate": { "maxUnavailable": 1, "maxSurge": 0 } } |
        (if $ref != "" then
           .spec.template.spec.containers |= map(
             if .name == "spiffe-helper" then . else
               .image |= (sub(":[^:]*$"; "") + (if ($ref | startswith("@")) then $ref else ":" + $ref end))
             end
           )
         else . end)
      ' \
    | kubectl apply -n "$NAMESPACE" -f -

  if ! kubectl rollout status -n "$NAMESPACE" "deployment/${canary_name}" --timeout=180s; then
    err "Canary $canary_name failed to become ready. Cleaning up and aborting."
    kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found &>/dev/null || true
    exit 1
  fi

  local total_reqs=0
  local error_reqs=0
  for _ in 1 2; do
    local metrics
    metrics=$(kubectl exec -n "$NAMESPACE" "deployment/${canary_name}" -- \
      curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
      https://localhost:3000/metrics 2>/dev/null || true)
    local reqs errs
    reqs=$(echo "$metrics" | grep -E '^http_requests_total\{' | awk -F'[ ]' '{s+=$2} END{print s+0}')
    errs=$(echo "$metrics" | grep -E '^http_requests_total\{[^}]*status="[45]' | awk -F'[ ]' '{s+=$2} END{print s+0}')
    total_reqs=$(( total_reqs + ${reqs:-0} ))
    error_reqs=$(( error_reqs + ${errs:-0} ))
    sleep 5
  done

  if [[ "$total_reqs" -gt 0 ]]; then
    local error_pct=$(( error_reqs * 100 / total_reqs ))
    log "Canary $canary_name error rate: ${error_pct}% (${error_reqs}/${total_reqs})"
    if [[ "$error_pct" -gt "${CANARY_ERROR_THRESHOLD_PCT:-5}" ]]; then
      err "Canary $canary_name error rate ${error_pct}% exceeds threshold (${CANARY_ERROR_THRESHOLD_PCT:-5}%). Rolling back."
      kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found &>/dev/null || true
      exit 1
    fi
  else
    log "No traffic observed on $canary_name during the gate window — skipping error check."
  fi

  log "Canary $canary_name is ready. Full rollout can proceed."

  if feature_enabled "canary-auto-cleanup"; then
    log "FEATURE_FLAGS includes canary-auto-cleanup — removing $canary_name"
    kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found &>/dev/null || true
  else
    log "Canary $canary_name kept for inspection. Remove it with: $0 canary-cleanup $service"
  fi
}

cmd_canary_cleanup() {
  local service="${1:-}"
  if [[ -z "$service" ]]; then
    err "Usage: $0 canary-cleanup <service>"
    exit 1
  fi
  local canary_name="${service}-canary"
  if kubectl get deployment -n "$NAMESPACE" "$canary_name" &>/dev/null; then
    log "Removing canary deployment $canary_name"
    kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found
  fi
}

cmd_pin() {
  log "Pinning deployed images to immutable @sha256 digests..."
  local services=(
    discovery-server message-manager financial-scraper trader-trainer
    api-gateway audit-logger dlq-service admin-interface
  )
  local failed=0
  for svc in "${services[@]}"; do
    local image
    image=$(kubectl get deployment -n "$NAMESPACE" "$svc" -o json \
      | jq -r --arg name "$svc" '.spec.template.spec.containers[] | select(.name == $name) | .image' 2>/dev/null || true)
    [[ -z "$image" || "$image" == *"@"* ]] && continue
    local repo="${image%%:*}"
    local tag="${image##*:}"
    local digest
    if digest="$(resolve_image_digest "$repo" "$tag")"; then
      log "  ✓ $svc: $image → ${repo}@${digest}"
      kubectl set image -n "$NAMESPACE" "deployment/${svc}" "${svc}=${repo}@${digest}" >/dev/null
    else
      err "  ✗ could not resolve digest for $svc ($image)"
      failed=$((failed + 1))
    fi
  done
  if [[ "$failed" -gt 0 ]]; then
    err "$failed image(s) could not be pinned."
    exit 1
  fi
  log "All deployed images pinned to digests."
}

cmd_smoke_test() {
  log "Running smoke tests..."

  local services=(
    "discovery-server:https://discovery-server:3000/ping"
    "message-manager:https://message-manager:3000/ping"
    "api-gateway:https://api-gateway:3000/ping"
    "audit-logger:https://audit-logger:3000/ping"
    "dlq-service:https://dlq-service:3000/ping"
    "financial-scraper:https://financial-scraper:3000/ping"
    "trader-trainer:https://trader-trainer:3000/ping"
    "admin-interface:http://admin-interface:8080/ping"
  )

  local failed=0
  for entry in "${services[@]}"; do
    local name="${entry%%:*}"
    local url="${entry#*:}"

    if kubectl exec -n "$NAMESPACE" deployment/discovery-server -- \
         curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem "$url" -o /dev/null -w '%{http_code}' 2>/dev/null | grep -q "200"; then
      log "  ✓ $name is healthy"
    else
      err "  ✗ $name is NOT healthy"
      failed=$((failed + 1))
    fi
  done

  if [[ "$failed" -eq 0 ]]; then
    log "All smoke tests passed!"
  else
    err "$failed service(s) failed smoke tests."
    exit 1
  fi
}

# ─── Main ─────────────────────────────────────────────────────────────────────

check_prereqs

while [[ $# -gt 0 ]]; do
  case "$1" in
    -n|--namespace)
      if [[ $# -lt 2 ]]; then
        err "-n/--namespace requires a value"
        exit 1
      fi
      NAMESPACE="$2"
      shift 2
      ;;
    *)
      break
      ;;
  esac
done

case "${1:-help}" in
  apply)
    cmd_apply "${2:-}"
    ;;
  delete)
    cmd_delete "${2:-}"
    ;;
  status)
    cmd_status
    ;;
  rollback)
    cmd_rollback "${2:-}" "${3:-}"
    ;;
  canary)
    cmd_canary "${2:-}" "${3:-}" "${4:-10}"
    ;;
  canary-cleanup)
    cmd_canary_cleanup "${2:-}"
    ;;
  pin)
    cmd_pin
    ;;
  smoke-test)
    cmd_smoke_test
    ;;
  *)
    echo "Trading Model K8s Deploy Script"
    echo ""
    echo "Usage:"
    echo "  $0 [-n namespace] apply [service]       Apply manifests"
    echo "  $0 [-n namespace] delete [service]      Delete resources"
    echo "  $0 [-n namespace] status                Show cluster status"
    echo "  $0 [-n namespace] rollback <srv> [rev]  Rollback deployment"
    echo "  $0 [-n namespace] canary <srv> [tag] [pct]     Canary deployment"
    echo "  $0 [-n namespace] canary-cleanup <srv>  Remove canary deployment"
    echo "  $0 [-n namespace] pin                     Pin deployed images to digests"
    echo "  $0 [-n namespace] smoke-test            Run smoke tests"
    echo "Namespace defaults to trading-model (env: K8S_NAMESPACE)."
    echo "Feature flags (FEATURE_FLAGS=flag1,flag2): canary-auto-cleanup"
    exit 1
    ;;
esac
