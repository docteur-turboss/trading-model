#!/usr/bin/env bash
# Example: Query audit events
# Prerequisites: docker compose up -d audit-logger

set -euo pipefail

API_GATEWAY="${API_GATEWAY:-https://localhost:8448}"
ADMIN_TOKEN="${ADMIN_TOKEN:-changeme}"

echo "=== Audit Event Stats ==="
curl -sk "${API_GATEWAY}/v1/audit/events/stats" \
  -H "x-api-key: ${ADMIN_TOKEN}" | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "=== Recent Events (last 5) ==="
curl -sk "${API_GATEWAY}/v1/audit/events?limit=5" \
  -H "x-api-key: ${ADMIN_TOKEN}" | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "=== Events filtered by topic ==="
curl -sk "${API_GATEWAY}/v1/audit/events?topic=market.trade.recent.fetch&limit=2" \
  -H "x-api-key: ${ADMIN_TOKEN}" | python3 -m json.tool 2>/dev/null || cat
