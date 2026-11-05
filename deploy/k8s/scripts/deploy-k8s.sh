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

# jobs/ packages scripts/backup-k8s.sh from outside its directory, which the
# default kustomize load restrictor rejects (kubectl apply -k cannot relax it).
kustomize_build() {
  kubectl kustomize --load-restrictor LoadRestrictionsNone "$1"
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
    # Rendered, not applied file by file: the Deployment reads a ConfigMap
    # whose name carries a hash only kustomize computes (issue #410). The
    # scraper collector reads financial-scraper-config: applied together.
    kustomize_build "${K8S_DIR}/" |
      kubectl apply -n "$NAMESPACE" -l "app.kubernetes.io/component in (${service},${service}-collector)" -f -
  else
    # Node agents first (SPIRE agent, SPIFFE CSI driver, promtail): the
    # workloads mount the agent socket through the CSI driver.
    log "Applying node agents (trading-model-node)..."
    kustomize_build "${K8S_DIR}/node-agents" | kubectl apply -f -
    log "Applying all Trading Model manifests..."
    kustomize_build "${K8S_DIR}/" | kubectl apply -f -
  fi

  log "Deployment applied. Waiting for rollouts..."

  local rollout_failed=0
  if [[ -n "$service" ]]; then
    if ! kubectl rollout status -n "$NAMESPACE" "deployment/${service}" --timeout=120s; then
      err "Rollout of $service failed or timed out."
      rollout_failed=1
    fi
  else
    for dep in discovery-server message-manager financial-scraper financial-scraper-collector trader-trainer \
               api-gateway audit-logger dlq-service edge-proxy; do
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
    kustomize_build "${K8S_DIR}/" | kubectl delete -f - --ignore-not-found
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

  if [[ "$count" != "all" && ! "$count" =~ ^[1-9][0-9]*$ ]]; then
    err "Invalid rollback count: $count (use a positive integer or 'all')"
    exit 1
  fi

  log "Preparing database rollback (count=$count)..."

  # Ensure the migration ConfigMap is up-to-date.
  kubectl create configmap migration-files -n "$NAMESPACE" \
    --from-file=migrate.mjs=scripts/migrate.mjs \
    --from-file=scripts/migrations \
    --dry-run=client -o yaml | kubectl apply -f -

  # ROLLBACK_COUNT lives in its own ConfigMap: applying migration-files with
  # only this key would prune migrate.mjs and the SQL files from it.
  kubectl create configmap migration-rollback -n "$NAMESPACE" \
    --from-literal=ROLLBACK_COUNT="$count" \
    --dry-run=client -o yaml | kubectl apply -f -

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

# Services without request metrics: their canary gate can only check readiness.
# Declared here (comma-separated) so the exemption is explicit and logged.
# None today: every released service exposes request metrics.
CANARY_READINESS_ONLY="${CANARY_READINESS_ONLY:-}"

# Sums http_requests_total from a /metrics payload on stdin and prints
# "<total> <errors>" (4xx/5xx). Kubelet probes and Prometheus scrapes are
# excluded: only real traffic counts.
canary_request_counts() {
  awk '
    /^http_requests_total\{/ {
      if ($0 ~ /path="\/(health[^"]*|ping|metrics)"/) next
      total += $NF
      if ($0 ~ /status="[45]/) errors += $NF
    }
    END { printf "%d %d\n", total, errors }'
}

abort_canary() {
  local canary_name="$1"
  shift
  err "$*"
  kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found
  exit 1
}

cmd_canary() {
  local service="${1:-}"
  local image_tag="${2:-}"
  local percentage="${3:-10}"
  local gate_seconds="${CANARY_GATE_SECONDS:-120}"
  local min_requests="${CANARY_MIN_REQUESTS:-20}"
  local error_threshold="${CANARY_ERROR_THRESHOLD_PCT:-5}"

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

  # A canary left by an earlier run may carry another (immutable) selector.
  kubectl delete deployment -n "$NAMESPACE" "$canary_name" --ignore-not-found --wait=true

  # Built in one pass from the primary: same pod spec, the NEW image, fresh
  # metadata (no last-applied-configuration, revision or uid). Pods keep the
  # component label the Service selects, so the canary takes its share of live
  # traffic; track=canary keeps its ReplicaSet apart from the primary's.
  log "Creating canary $canary_name for $service ($canary_replicas replicas, image $image_ref)"
  # Explicit check: errexit is ignored when the caller tests cmd_canary.
  local manifest
  if ! manifest=$(kubectl get deployment -n "$NAMESPACE" "$service" -o json \
    | jq --arg name "$canary_name" --arg svc "$service" --arg image "$image_ref" \
         --argjson replicas "$canary_replicas" '
        if any(.spec.template.spec.containers[]; .name == $svc) then . else
          error("deployment \($svc) has no container named \($svc)") end
        | .metadata = {name: $name, labels: ((.metadata.labels // {}) + {track: "canary"})}
        | del(.status)
        | .spec.replicas = $replicas
        | .spec.selector.matchLabels.track = "canary"
        | .spec.template.metadata.labels.track = "canary"
        | .spec.template.spec.containers |= map(if .name == $svc then .image = $image else . end)
      '); then
    abort_canary "$canary_name" "Could not build the $canary_name manifest from deployment/$service."
  fi
  echo "$manifest" | kubectl apply -n "$NAMESPACE" -f -

  if ! kubectl rollout status -n "$NAMESPACE" "deployment/${canary_name}" --timeout=180s; then
    abort_canary "$canary_name" "Canary $canary_name failed to become ready. Cleaning up and aborting."
  fi

  # The traffic share is only claimed once the Service actually routes to the canary.
  local routed=0 ready=0
  for _ in 1 2 3 4 5 6; do
    read -r routed ready < <(kubectl get endpointslices -n "$NAMESPACE" \
        -l "kubernetes.io/service-name=${service}" -o json \
      | jq -r --arg prefix "${canary_name}-" '
          [.items[].endpoints[]? | select(.conditions.ready != false)]
          | "\(map(select((.targetRef.name // "") | startswith($prefix))) | length) \(length)"')
    [[ "$routed" -gt 0 ]] && break
    sleep 5
  done
  if [[ "$routed" -eq 0 ]]; then
    abort_canary "$canary_name" "Service $service does not route to $canary_name: the canary would receive no traffic."
  fi
  log "Service $service routes to $canary_name: ${routed}/${ready} ready endpoints (~$(( routed * 100 / ready ))% of traffic)"

  if [[ ",${CANARY_READINESS_ONLY}," == *",${service},"* ]]; then
    log "WARNING: $service exposes no request metrics — readiness-only gate (declared in CANARY_READINESS_ONLY), no error-rate check."
  else
    log "Observing $canary_name for ${gate_seconds}s (min ${min_requests} requests, max ${error_threshold}% errors)..."
    sleep "$gate_seconds"

    local total_reqs=0 error_reqs=0 pod metrics reqs errs
    for pod in $(kubectl get pods -n "$NAMESPACE" -l "app.kubernetes.io/component=${service},track=canary" -o name); do
      if ! metrics=$(kubectl exec -n "$NAMESPACE" "$pod" -c "$service" -- \
          curl -sfk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem \
          https://localhost:3000/metrics 2>/dev/null); then
        abort_canary "$canary_name" "Canary pod ${pod#pod/} did not serve /metrics."
      fi
      read -r reqs errs < <(canary_request_counts <<<"$metrics")
      total_reqs=$(( total_reqs + reqs ))
      error_reqs=$(( error_reqs + errs ))
    done

    log "Canary $canary_name served ${total_reqs} requests, ${error_reqs} errors (probes and scrapes excluded)."
    # No signal is a failure: a gate that saw no traffic has verified nothing.
    if [[ "$total_reqs" -lt "$min_requests" || "$total_reqs" -eq 0 ]]; then
      abort_canary "$canary_name" "Canary $canary_name saw ${total_reqs} requests in ${gate_seconds}s (CANARY_MIN_REQUESTS=${min_requests}): nothing was verified. Send traffic during the gate, or tune CANARY_MIN_REQUESTS / CANARY_GATE_SECONDS for this environment."
    fi
    local error_pct=$(( error_reqs * 100 / total_reqs ))
    if [[ "$error_pct" -gt "$error_threshold" ]]; then
      abort_canary "$canary_name" "Canary $canary_name error rate ${error_pct}% exceeds threshold (${error_threshold}%). Rolling back."
    fi
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
    discovery-server message-manager financial-scraper financial-scraper-collector trader-trainer
    api-gateway audit-logger dlq-service
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
    "financial-scraper-collector:https://financial-scraper-collector:3000/health/ready"
    "trader-trainer:https://trader-trainer:3000/health/ready"
    "edge-proxy:http://edge-proxy:8080/health/ready"
  )

  local failed=0
  for entry in "${services[@]}"; do
    local name="${entry%%:*}"
    local url="${entry#*:}"

    if kubectl exec -n "$NAMESPACE" deployment/discovery-server -c discovery-server -- \
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
