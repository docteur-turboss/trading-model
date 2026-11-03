#!/usr/bin/env bash
# Example: Query audit events through the gateway
# Prerequisites: docker compose up -d (api-gateway, edge-proxy, audit-logger).

set -euo pipefail

API_GATEWAY="${API_GATEWAY:-http://localhost:8449}"  # edge-proxy
ADMIN_TOKEN="${ADMIN_TOKEN:-changeme}"                # one of the gateway AUTH_TOKENS

# Pretty-prints JSON with jq when it is installed, raw output otherwise.
pretty() { if command -v jq >/dev/null 2>&1; then jq .; else cat; echo; fi; }

echo "=== Audit event stats ==="
curl -s "${API_GATEWAY}/v1/audit-logger/events/stats" \
  -H "x-api-key: ${ADMIN_TOKEN}" | pretty

echo ""
echo "=== Recent events (last 5) ==="
curl -s "${API_GATEWAY}/v1/audit-logger/events?limit=5" \
  -H "x-api-key: ${ADMIN_TOKEN}" | pretty

echo ""
echo "=== Events filtered by topic ==="
curl -s "${API_GATEWAY}/v1/audit-logger/events?topic=market.trade.recent.fetch&limit=2" \
  -H "x-api-key: ${ADMIN_TOKEN}" | pretty
