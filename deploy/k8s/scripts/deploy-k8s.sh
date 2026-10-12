#!/usr/bin/env bash
# =============================================================================
#  deploy-k8s.sh — Kubernetes Deployment Script for Trading Model
#  Usage:
#    ./deploy-k8s.sh [-n <namespace>] apply           # Apply all manifests
#    ./deploy-k8s.sh [-n <namespace>] apply <service> # Apply a single service
#    ./deploy-k8s.sh [-n <namespace>] delete          # Delete all resources
#    ./deploy-k8s.sh [-n <namespace>] status          # Show deployment status
#    ./deploy-k8s.sh [-n <namespace>] rollback <service> [revision]
#    ./deploy-k8s.sh [-n <namespace>] migrate-down [count|all]
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
    kubectl apply -n "$NAMESPACE" -f "${K8S_DIR}/config/${service}-configmap.yaml"
    kubectl apply -n "$NAMESPACE" -f "${K8S_DIR}/services/${service}.yaml"
  else
    log "Applying all Trading Model manifests..."
    kubectl apply -k "${K8S_DIR}/"
  fi

  log "Deployment applied. Waiting for rollouts..."

  local rollout_failed=0
  if [[ -n "$service" ]]; then
    if ! kubectl rollout status -n "$NAMESPACE" "deployment/${service}" --timeout=120s; then
      err "Rollout of $service failed or timed out."
      rollout_failed=1
    fi
  else
    for dep in discovery-server message-manager financial-scraper trader-trainer \
               api-gateway audit-logger dlq-service admin-interface; do
      if ! kubectl rollout status -n "$NAMESPACE" "deployment/${dep}" --timeout=120s; then
        err "Rollout of $dep failed or timed out."
        rollout_failed=1
      fi
    done
  fi

  if [[ "$rollout_failed" -ne 0 ]]; then
    err "One or more deployments failed to roll out."
    exit 1
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

cmd_migrate_down() {
  local count="${1:-1}"

  log "Preparing database rollback (count=$count)..."

  # Ensure the migration ConfigMap is up-to-date.
  kubectl create configmap migration-files -n "$NAMESPACE" \
    --from-file=migrate.mjs=scripts/migrate.mjs \
    --from-file=scripts/migrations \
    --dry-run=client -o yaml | kubectl apply -f -

  # Patch ROLLBACK_COUNT into the ConfigMap.
  if [[ "$count" == "all" ]]; then
    kubectl create configmap migration-files -n "$NAMESPACE" \
      --from-literal=ROLLBACK_COUNT=all \
      --dry-run=client -o yaml | kubectl apply -f -
  elif [[ "$count" =~ ^[0-9]+$ ]]; then
    kubectl create configmap migration-files -n "$NAMESPACE" \
      --from-literal=ROLLBACK_COUNT="$count" \
      --dry-run=client -o yaml | kubectl apply -f -
  else
    err "Invalid rollback count: $count (use a positive integer or 'all')"
    exit 1
  fi

  # Clean up any previous down job.
  kubectl delete job -n "$NAMESPACE" db-migrate-down --ignore-not-found &>/dev/null || true

  log "Starting migration rollback job..."
  kubectl apply -n "$NAMESPACE" -f "${K8S_DIR}/jobs/migration-job-down.yaml"

  log "Waiting for migration rollback to complete..."
  if ! kubectl wait --for=condition=complete job/db-migrate-down -n "$NAMESPACE" --timeout=180s; then
    err "Migration rollback job failed or timed out."
    if ! kubectl logs -n "$NAMESPACE" job/db-migrate-down --tail=50 2>/dev/null; then
      err "Could not retrieve logs from db-migrate-down job"
    fi
    exit 1
  fi

  log "Migration rollback complete."
  kubectl logs -n "$NAMESPACE" job/db-migrate-down --tail=20 2>/dev/null
}

cmd_canary() {
  local service="${1:-}"
  local image_tag="${2:-}"
  local percentage="${3:-10}"

  if [[ -z "$service" ]]; then
    err "Usage: $0 canary <service> [image-tag] [percentage]"
    exit 1
  fi

  local canary_name="${service}-canary"
  local total_replicas
  total_replicas=$(kubectl get deployment -n "$NAMESPACE" "$service" -o jsonpath='{.spec.replicas}')
  if [[ -z "$total_replicas" || "$total_replicas" -lt 1 ]]; then
    err "Primary deployment '$service' not found or has 0 replicas in namespace $NAMESPACE"
    exit 1
  fi
  local canary_replicas=$(( total_replicas * percentage / 100 ))
  [[ "$canary_replicas" -lt 1 ]] && canary_replicas=1

  local traffic_share=$(( canary_replicas * 100 / (total_replicas + canary_replicas) ))
  log "Creating canary $canary_name for $service ($canary_replicas replicas, ~${traffic_share}% of traffic)"

  # Resolve image: prefer immutable @sha256 digest over mutable tag.
  local image_ref="${image_tag:-}"
  if [[ -n "$image_ref" ]]; then
    local digest
    if digest="$(resolve_image_digest "${CANARY_IMAGE_REPO:-ghcr.io/trading-model}/${service}" "$image_ref")"; then
      image_ref="${CANARY_IMAGE_REPO:-ghcr.io/trading-model}/${service}@${digest}"
      log "Pinned ${service} canary image to digest ${digest}"
    else
      image_ref="${CANARY_IMAGE_REPO:-ghcr.io/trading-model}/${service}:${image_tag}"
      log "WARNING: could not resolve a digest for ${service}:${image_tag} — falling back to tag"
    fi
  else
    image_ref="${CANARY_IMAGE_REPO:-ghcr.io/trading-model}/${service}:latest"
  fi

  # Create canary deployment from scratch with a unique selector.
  # The selector uses the canary name to avoid ReplicaSet conflicts with the primary.
  kubectl create deployment "$canary_name" \
    -n "$NAMESPACE" \
    --image="$image_ref" \
    --replicas="$canary_replicas" \
    --dry-run=client -o yaml \
    | kubectl label --local -f - -o yaml \
        --overwrite \
        app.kubernetes.io/component="$canary_name" \
        app.kubernetes.io/part-of=trading-model \
        track=canary \
    | kubectl apply -n "$NAMESPACE" -f -

  # Copy pod spec from the primary deployment, but give the canary its own selector
  # so its ReplicaSet does not fight with the primary's for the same pods.
  kubectl get deployment -n "$NAMESPACE" "$service" -o json \
    | jq --arg name "$canary_name" '
        .metadata.name = $name |
        .metadata.resourceVersion = null |
        .metadata.uid = null |
        .metadata.creationTimestamp = null |
        del(.status) |
        .spec.replicas = '"$canary_replicas"' |
        .spec.selector.matchLabels["app.kubernetes.io/component"] = $name |
        .spec.template.metadata.labels["app.kubernetes.io/component"] = $name
      ' \
    | kubectl apply -n "$NAMESPACE" -f -

  if ! kubectl rollout status -n "$NAMESPACE" "deployment/${canary_name}" --timeout=180s; then
    err "Canary $canary_name failed to become ready. Cleaning up and aborting."
    kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found
    exit 1
  fi

  local total_reqs=0
  local error_reqs=0
  for _ in 1 2; do
    local metrics
    metrics=$(kubectl exec -n "$NAMESPACE" "deployment/${canary_name}" -- \
      curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
      https://localhost:3000/metrics 2>/dev/null)
    local curl_exit=$?
    if [[ "$curl_exit" -ne 0 ]]; then
      err "Canary $canary_name failed to respond to metrics request (curl exit $curl_exit)."
      kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found
      exit 1
    fi
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
      kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found
      exit 1
    fi
  else
    log "No traffic observed on $canary_name during the gate window — skipping error check."
  fi

  # Scale canary to 0 after successful gate — no traffic drain needed.
  log "Scaling canary $canary_name to 0 replicas."
  kubectl scale deployment -n "$NAMESPACE" "$canary_name" --replicas=0

  log "Canary $canary_name gate passed. Full rollout can proceed."

  if feature_enabled "canary-auto-cleanup"; then
    log "FEATURE_FLAGS includes canary-auto-cleanup — removing $canary_name"
    kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found
  else
    log "Canary $canary_name kept (scaled to 0). Remove it with: $0 canary-cleanup $service"
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
      | jq -r --arg name "$svc" '.spec.template.spec.containers[] | select(.name == $name) | .image' 2>/dev/null) || {
      err "Deployment '$svc' not found in namespace $NAMESPACE — skipping pin."
      continue
    }
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
    "discovery-server:https://discovery-server:3000/health/ready"
    "message-manager:https://message-manager:3000/health/ready"
    "api-gateway:https://api-gateway:3000/health/ready"
    "audit-logger:https://audit-logger:3000/health/ready"
    "dlq-service:https://dlq-service:3000/health/ready"
    "financial-scraper:https://financial-scraper:3000/health/ready"
    "trader-trainer:https://trader-trainer:3000/health/ready"
    "admin-interface:http://admin-interface:8080/health/ready"
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
  migrate-down)
    cmd_migrate_down "${2:-1}"
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
    echo "  $0 [-n namespace] migrate-down [N|all]  Rollback N DB migrations (default: 1)"
    echo "  $0 [-n namespace] canary <srv> [tag] [pct]     Canary deployment"
    echo "  $0 [-n namespace] canary-cleanup <srv>  Remove canary deployment"
    echo "  $0 [-n namespace] pin                     Pin deployed images to digests"
    echo "  $0 [-n namespace] smoke-test            Run smoke tests"
    echo "Namespace defaults to trading-model (env: K8S_NAMESPACE)."
    echo "Feature flags (FEATURE_FLAGS=flag1,flag2): canary-auto-cleanup"
    exit 1
    ;;
esac
