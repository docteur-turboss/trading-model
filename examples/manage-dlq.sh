#!/usr/bin/env bash
# Example: Manage the Dead Letter Queue through the gateway
# Prerequisites: docker compose up -d (api-gateway, edge-proxy, dlq-service).
#
# dlq-service accepts only HMAC-signed requests from an allowed caller
# (DLQ_ALLOWED_SERVICES, default "message-manager,admin") signed with
# DLQ_AUTH_HMAC_SECRET, on top of the gateway API key.

set -euo pipefail

API_GATEWAY="${API_GATEWAY:-http://localhost:8449}"  # edge-proxy
ADMIN_TOKEN="${ADMIN_TOKEN:-changeme}"                # one of the gateway AUTH_TOKENS

# Pretty-prints JSON with jq when it is installed, raw output otherwise.
pretty() { if command -v jq >/dev/null 2>&1; then jq .; else cat; echo; fi; }
DLQ_CALLER="${DLQ_CALLER:-admin}"
DLQ_SECRET="${DLQ_AUTH_HMAC_SECRET:?set DLQ_AUTH_HMAC_SECRET (dlq-service secret)}"

# signed_curl METHOD PATH [JSON_BODY] — PATH is the dlq-service path (/dlq...), query string included.
# Signature: HMAC-SHA256(secret, "caller:timestamp:sha256(body):METHOD:path"),
# body as compact JSON with sorted keys ("{}" when there is none).
signed_curl() {
  local method="$1" path="$2" body="${3:-}"
  local signed_body="${body}" ts body_hash signature
  local extra=()
  if [ -z "${signed_body}" ]; then
    signed_body='{}'
  else
    extra=(-H 'Content-Type: application/json' -d "${body}")
  fi
  ts="$(( $(date +%s) * 1000 ))"
  body_hash="$(printf '%s' "${signed_body}" | openssl dgst -sha256 -r | cut -d' ' -f1)"
  signature="$(printf '%s' "${DLQ_CALLER}:${ts}:${body_hash}:${method}:${path}" |
    openssl dgst -sha256 -hmac "${DLQ_SECRET}" -r | cut -d' ' -f1)"
  curl -s -X "${method}" "${API_GATEWAY}/v1/dlq-service${path}" \
    -H "x-api-key: ${ADMIN_TOKEN}" \
    -H "x-service-name: ${DLQ_CALLER}" \
    -H "x-timestamp: ${ts}" \
    -H "x-signature: ${signature}" \
    "${extra[@]}"
}

echo "=== DLQ entries ==="
signed_curl GET /dlq | pretty

echo ""
echo "=== Replay up to 10 entries of a topic ==="
echo "signed_curl POST '/dlq/replay?topic=market.trade.recent.fetch&limit=10'"

echo ""
echo "=== Delete entries by id ==="
echo "signed_curl DELETE /dlq '{\"ids\":[\"<id>\"]}'"
