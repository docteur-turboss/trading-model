#!/usr/bin/env bash
# =============================================================================
#  deploy-beta.sh — Beta canary deployment for Trading Model
#
#  Usage:
#    ./scripts/deploy-beta.sh                          # deploy to 2% canary
#    ./scripts/deploy-beta.sh --canary 5               # override to 5%
#    ./scripts/deploy-beta.sh --threshold 0.03         # 3% error threshold
#    ./scripts/deploy-beta.sh --branch feat/foo        # custom branch
#    ./scripts/deploy-beta.sh --rollback               # force rollback to main
#    ./scripts/deploy-beta.sh --skip-canary             # deploy to all hosts
#    ./scripts/deploy-beta.sh --hosts ./hosts.json     # custom inventory
#
#  Requires: git, docker, docker compose, curl, jq
# =============================================================================

set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
CONFIG="./scripts/hosts.json"
CANARY_PERCENT=2
ERROR_THRESHOLD=0.05
BRANCH=""
ROLLBACK=false
SKIP_CANARY=false
HEALTH_RETRIES=3
HEALTH_INTERVAL=10
MONITOR_MIN=30

# ── Parse args ────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --canary)     CANARY_PERCENT="$2"; shift 2 ;;
        --threshold)  ERROR_THRESHOLD="$2"; shift 2 ;;
        --branch)     BRANCH="$2"; shift 2 ;;
        --hosts)      CONFIG="$2"; shift 2 ;;
        --rollback)   ROLLBACK=true; shift ;;
        --skip-canary) SKIP_CANARY=true; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# ── Load config ───────────────────────────────────────────────────────────────
if [[ -f "$CONFIG" ]]; then
    echo "[*] Loading config from $CONFIG"
    CANARY_PERCENT=$(jq -r ".deploy.canary_percent // $CANARY_PERCENT" "$CONFIG")
    ERROR_THRESHOLD=$(jq -r ".deploy.error_threshold // $ERROR_THRESHOLD" "$CONFIG")
    HEALTH_RETRIES=$(jq -r ".deploy.health_check_retries // $HEALTH_RETRIES" "$CONFIG")
    HEALTH_INTERVAL=$(jq -r ".deploy.health_check_interval_sec // $HEALTH_INTERVAL" "$CONFIG")
    MONITOR_MIN=$(jq -r ".deploy.monitor_duration_min // $MONITOR_MIN" "$CONFIG")
    : "${BRANCH:=$(jq -r '.deploy.branch_dev // "development"' "$CONFIG")}"
    STABLE_BRANCH=$(jq -r '.deploy.branch_stable // "main"' "$CONFIG")
    IMAGE_TAG_DEV=$(jq -r '.deploy.image_tag_dev // "latest"' "$CONFIG")
else
    : "${BRANCH:=development}"
    STABLE_BRANCH="main"
    IMAGE_TAG_DEV="latest"
    echo "[!] No config found — using defaults"
fi

# ── Helpers ───────────────────────────────────────────────────────────────────

get_active_hosts() {
    if [[ -f "$CONFIG" ]]; then
        jq -c '.hosts[] | select(.active == true)' "$CONFIG"
    else
        echo '{"host":"localhost","user":"","label":"localhost"}'
    fi
}

get_canary_hosts() {
    local percent="$1"
    local all=("${@:2}")
    local total=${#all[@]}
    local count=$(( total * percent / 100 ))
    (( count < 1 )) && count=1
    for (( i=0; i<count && i<total; i++ )); do
        echo "${all[$i]}"
    done
}

remote_cmd() {
    local host_entry="$1"
    local cmd="$2"
    local host
    host=$(echo "$host_entry" | jq -r '.host')

    if [[ "$host" == "localhost" || "$host" == "127.0.0.1" ]]; then
        eval "$cmd"
    else
        local user
        user=$(echo "$host_entry" | jq -r '.user // empty')
        local ssh_target
        if [[ -n "$user" ]]; then
            ssh_target="${user}@${host}"
        else
            ssh_target="$host"
        fi
        ssh "$ssh_target" "cd ${PWD} && ${cmd}"
    fi
}

deploy_host() {
    local host_entry="$1"
    local branch="$2"
    local tag="$3"
    local label
    label=$(echo "$host_entry" | jq -r '.label // .host')

    echo "  → Deploying ${branch} (tag: ${tag}) on ${label}..."
    local output
    output=$(remote_cmd "$host_entry" "
        git fetch origin
        git checkout ${branch}
        git pull origin ${branch}
        IMAGE_TAG=${tag} docker compose pull
        IMAGE_TAG=${tag} docker compose up -d
    " 2>&1) || {
        echo "  ✗ Deploy failed on ${label}"
        echo "$output"
        return 1
    }
    echo "  ✓ Deployed on ${label}"
    return 0
}

get_health_endpoints() {
    if [[ -f "$CONFIG" ]]; then
        jq -r '.deploy.health_endpoints // {} | to_entries[] | "\(.key)=\(.value)"' "$CONFIG" 2>/dev/null
    fi
}

check_health_url() {
    local url="$1"
    curl -skf "$url" > /dev/null 2>&1
}

wait_for_healthy() {
    local retries="$1"
    local interval="$2"
    local -a endpoints=()

    while IFS='=' read -r name url; do
        endpoints+=("$name|$url")
    done < <(get_health_endpoints)

    if [[ ${#endpoints[@]} -eq 0 ]]; then
        # fallback defaults
        endpoints=(
            "discovery-server|https://localhost:8443/ping"
            "message-manager|https://localhost:8444/health"
            "financial-scraper|https://localhost:8445/health"
            "trader-trainer|https://localhost:8446/health"
        )
    fi

    for (( r=1; r<=retries; r++ )); do
        local unhealthy=0
        for entry in "${endpoints[@]}"; do
            local url="${entry#*|}"
            if ! check_health_url "$url"; then
                ((unhealthy++))
            fi
        done
        if (( unhealthy == 0 )); then
            return 0
        fi
        echo "      (retry ${r}/${retries} — ${unhealthy} service(s) unhealthy)"
        (( r < retries )) && sleep "$interval"
    done
    return 1
}

measure_error_rate() {
    local samples="$1"
    local interval="$2"
    local -a endpoints=()

    while IFS='=' read -r name url; do
        endpoints+=("$name|$url")
    done < <(get_health_endpoints)

    if [[ ${#endpoints[@]} -eq 0 ]]; then
        endpoints=(
            "discovery-server|https://localhost:8443/ping"
            "message-manager|https://localhost:8444/health"
            "financial-scraper|https://localhost:8445/health"
            "trader-trainer|https://localhost:8446/health"
        )
    fi

    local errors=0
    local total=0

    for (( i=0; i<samples; i++ )); do
        for entry in "${endpoints[@]}"; do
            local url="${entry#*|}"
            ((total++))
            if ! check_health_url "$url"; then
                ((errors++))
            fi
        done
        (( i < samples - 1 )) && sleep "$interval"
    done

    if (( total == 0 )); then echo "1.0"; return; fi
    awk -v e="$errors" -v t="$total" 'BEGIN { printf "%.4f", e / t }'
}

# ── Main ──────────────────────────────────────────────────────────────────────

echo "═══════════════════════════════════════════════"
echo "  Trading Model — Beta Deploy Server"
echo "═══════════════════════════════════════════════"

mapfile -t hosts < <(get_active_hosts)
echo ""
echo "Hosts available : ${#hosts[@]} active"
echo "Canary percent  : ${CANARY_PERCENT}%"
echo "Error threshold : $(echo "scale=1; ${ERROR_THRESHOLD} * 100" | bc)%"
echo "Target branch   : ${BRANCH}"
echo "Stable branch   : ${STABLE_BRANCH}"
echo ""

# ── Rollback mode ─────────────────────────────────────────────────────────────
if [[ "$ROLLBACK" == "true" ]]; then
    echo "[ROLLBACK] Redeploying ${STABLE_BRANCH} on all active hosts..."
    for host_entry in "${hosts[@]}"; do
        deploy_host "$host_entry" "$STABLE_BRANCH" "$IMAGE_TAG_DEV" || true
    done
    echo "[ROLLBACK] Done."
    exit 0
fi

# ── Select canary ─────────────────────────────────────────────────────────────
if [[ "$SKIP_CANARY" == "true" ]]; then
    canary_hosts=()
    remaining_hosts=("${hosts[@]}")
    echo "[CANARY] Skipped — deploying to all hosts directly"
else
    canary_hosts=()
    while IFS= read -r h; do canary_hosts+=("$h"); done < <(get_canary_hosts "$CANARY_PERCENT" "${hosts[@]}")
    remaining_hosts=()
    for h in "${hosts[@]}"; do
        found=false
        for ch in "${canary_hosts[@]}"; do
            [[ "$h" == "$ch" ]] && { found=true; break; }
        done
        [[ "$found" == false ]] && remaining_hosts+=("$h")
    done
    echo "[CANARY] ${#canary_hosts[@]} host(s) selected:"
    for h in "${canary_hosts[@]}"; do
        echo "         - $(echo "$h" | jq -r '.label // .host')"
    done
fi

# ── Phase 1: Deploy canary ────────────────────────────────────────────────────
echo ""
echo "═══ Phase 1: Canary deploy ═══════════════════"
canary_ok=true
for h in "${canary_hosts[@]}"; do
    deploy_host "$h" "$BRANCH" "$IMAGE_TAG_DEV" || { canary_ok=false; break; }
done

if [[ "$canary_ok" == false ]]; then
    echo "[!] Canary deploy failed — rolling back to ${STABLE_BRANCH}"
    for h in "${canary_hosts[@]}"; do
        deploy_host "$h" "$STABLE_BRANCH" "$IMAGE_TAG_DEV" || true
    done
    exit 1
fi

# ── Phase 2: Wait for healthy ─────────────────────────────────────────────────
echo ""
echo "═══ Phase 2: Health check ════════════════════"
if ! wait_for_healthy "$HEALTH_RETRIES" "$HEALTH_INTERVAL"; then
    echo "[!] Services not healthy — rolling back to ${STABLE_BRANCH}"
    for h in "${canary_hosts[@]}"; do
        deploy_host "$h" "$STABLE_BRANCH" "$IMAGE_TAG_DEV" || true
    done
    exit 1
fi
echo "  ✓ All services healthy"

# ── Phase 3: Monitor ──────────────────────────────────────────────────────────
echo ""
echo "═══ Phase 3: Monitor (${MONITOR_MIN} min) ═══════"
MONITOR_SAMPLES=$(( MONITOR_MIN * 2 ))  # one sample every 30s
SAMPLE_INTERVAL=30

error_rate=$(measure_error_rate "$MONITOR_SAMPLES" "$SAMPLE_INTERVAL")
echo "  Error rate: $(echo "scale=2; ${error_rate} * 100" | bc)% (threshold: $(echo "scale=1; ${ERROR_THRESHOLD} * 100" | bc)%)"

if (( $(echo "$error_rate > $ERROR_THRESHOLD" | bc -l) )); then
    echo "[!] Error rate exceeds threshold — rolling back to ${STABLE_BRANCH}"
    for h in "${canary_hosts[@]}"; do
        deploy_host "$h" "$STABLE_BRANCH" "$IMAGE_TAG_DEV" || true
    done
    exit 1
fi

# ── Phase 4: Full rollout ─────────────────────────────────────────────────────
if [[ ${#remaining_hosts[@]} -gt 0 ]]; then
    echo ""
    echo "═══ Phase 4: Full rollout ════════════════════"
    for h in "${remaining_hosts[@]}"; do
        deploy_host "$h" "$BRANCH" "$IMAGE_TAG_DEV" || echo "  ✗ Deploy failed on $(echo "$h" | jq -r '.label // .host')"
    done
else
    echo "  (no remaining hosts — canary covered all)"
fi

echo ""
echo "═══════════════════════════════════════════════"
echo "  Beta deploy complete!"
echo "  Branch: ${BRANCH}"
echo "  Hosts : ${#hosts[@]} deployed"
echo "═══════════════════════════════════════════════"
