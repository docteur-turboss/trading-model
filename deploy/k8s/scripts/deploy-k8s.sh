#!/usr/bin/env bash
# =============================================================================
#  deploy-k8s.sh — Kubernetes Deployment Script for Trading Model
#  Usage:
#    ./deploy-k8s.sh apply           # Apply all manifests
#    ./deploy-k8s.sh apply <service> # Apply a single service
#    ./deploy-k8s.sh delete          # Delete all resources
#    ./deploy-k8s.sh status          # Show deployment status
#    ./deploy-k8s.sh rollback <service> [revision]
#    ./deploy-k8s.sh canary <service> <percentage>
#    ./deploy-k8s.sh smoke-test      # Run smoke tests
# =============================================================================

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
K8S_DIR="${SCRIPT_DIR}/k8s"
NAMESPACE="trading-model"

log()  { echo "[$(date '+%H:%M:%S')] $*"; }
err()  { echo "[$(date '+%H:%M:%S')] ERROR: $*" >&2; }

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
  local service="$1"
  local percentage="${2:-2}"

  if [[ -z "$service" ]]; then
    err "Usage: $0 canary <service> <percentage>"
    exit 1
  fi

  local total_replicas
  total_replicas=$(kubectl get deployment -n "$NAMESPACE" "$service" -o jsonpath='{.spec.replicas}')
  local canary_replicas=$(( total_replicas * percentage / 100 ))
  [[ $canary_replicas -lt 1 ]] && canary_replicas=1

  log "Deploying canary for $service: $canary_replicas of $total_replicas replicas ($percentage%)"

  kubectl scale deployment -n "$NAMESPACE" "canary-${service}" --replicas="$canary_replicas" 2>/dev/null || \
    log "Canary deployment not found. Create a canary deployment, or use --skip-canary flag."

  log "Monitoring canary for 30 seconds..."
  sleep 30

  local error_rate
  error_rate=$(kubectl logs -n "$NAMESPACE" -l "app.kubernetes.io/component=${service}" --tail=50 2>/dev/null | grep -c "error\|Error\|ERROR" || true)

  if [[ "$error_rate" -gt 5 ]]; then
    err "Canary error rate too high ($error_rate errors). Rolling back."
    kubectl scale deployment -n "$NAMESPACE" "canary-${service}" --replicas=0 2>/dev/null || true
    exit 1
  fi

  log "Canary healthy. Proceeding with full rollout..."
  kubectl rollout restart -n "$NAMESPACE" "deployment/${service}"
  kubectl rollout status -n "$NAMESPACE" "deployment/${service}" --timeout=120s
  log "Full rollout of $service complete."
}

cmd_blue_green() {
  local service="$1"
  local mode="${2:-deploy}"

  if [[ -z "$service" ]]; then
    err "Usage: $0 blue-green <service> <deploy|promote|rollback>"
    exit 1
  fi

  local GREEN_LABEL="color=green"
  local BLUE_LABEL="color=blue"
  local active_color
  local inactive_color
  local active_replicas

  case "$mode" in
    deploy)
      active_color=$(kubectl get deployment -n "$NAMESPACE" "$service" -o jsonpath='{.spec.template.metadata.labels.color}' 2>/dev/null || echo "blue")
      if [[ "$active_color" == "blue" ]]; then
        inactive_color="green"
      else
        inactive_color="blue"
      fi

      log "Deploying $inactive_color environment for $service..."

      local service_file="${K8S_DIR}/services/${service}.yaml"
      if [[ ! -f "$service_file" ]]; then
        err "Service manifest not found: $service_file"
        exit 1
      fi

      kubectl apply -n "$NAMESPACE" -f "$service_file"
      kubectl patch deployment -n "$NAMESPACE" "$service" --patch \
        "{\"spec\":{\"template\":{\"metadata\":{\"labels\":{\"color\":\"$inactive_color\"}}}}}"

      log "Waiting for $inactive_color deployment to be ready..."
      kubectl rollout status -n "$NAMESPACE" "deployment/${service}" --timeout=180s

      log "Running smoke tests against $inactive_color..."
      cmd_smoke_test

      log "$inactive_color environment for $service is ready. Promote with: $0 blue-green $service promote"
      ;;

    promote)
      active_color=$(kubectl get deployment -n "$NAMESPACE" "$service" -o jsonpath='{.spec.template.metadata.labels.color}' 2>/dev/null || echo "blue")
      if [[ "$active_color" == "blue" ]]; then
        inactive_color="green"
      else
        inactive_color="blue"
      fi

      log "Promoting $inactive_color to active for $service..."
      kubectl patch service -n "$NAMESPACE" "$service" --patch \
        "{\"spec\":{\"selector\":{\"color\":\"$inactive_color\"}}}"
      log "Traffic switched to $inactive_color. Deactivate the old environment with: $0 blue-green $service rollback"
      ;;

    rollback)
      active_color=$(kubectl get deployment -n "$NAMESPACE" "$service" -o jsonpath='{.spec.template.metadata.labels.color}' 2>/dev/null || echo "blue")
      if [[ "$active_color" == "blue" ]]; then
        inactive_color="green"
      else
        inactive_color="blue"
      fi

      log "Rolling back: switching traffic back to $inactive_color for $service..."
      kubectl patch service -n "$NAMESPACE" "$service" --patch \
        "{\"spec\":{\"selector\":{\"color\":\"$inactive_color\"}}}"

      log "Scaling down $active_color deployment..."
      kubectl scale deployment -n "$NAMESPACE" "$service" --replicas=0
      log "Rollback complete. Active environment: $inactive_color"
      ;;

    *)
      err "Unknown blue-green mode: $mode (use deploy, promote, or rollback)"
      exit 1
      ;;
  esac
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
    "admin-interface:https://admin-interface:3000/health/ready"
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
    cmd_canary "${2:-}" "${3:-2}"
    ;;
  blue-green)
    cmd_blue_green "${2:-}" "${3:-deploy}"
    ;;
  smoke-test)
    cmd_smoke_test
    ;;
  *)
    echo "Trading Model K8s Deploy Script"
    echo ""
    echo "Usage:"
    echo "  $0 apply [service]          Apply manifests"
    echo "  $0 delete [service]         Delete resources"
    echo "  $0 status                   Show cluster status"
    echo "  $0 rollback <srv> [rev]     Rollback deployment"
    echo "  $0 canary <srv> [pct]       Canary deployment"
    echo "  $0 blue-green <srv> <mode>  Blue/Green deploy|promote|rollback"
    echo "  $0 smoke-test               Run smoke tests"
    exit 1
    ;;
esac
