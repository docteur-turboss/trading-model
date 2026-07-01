#!/usr/bin/env bash
# Example: Manage Dead Letter Queue
# Prerequisites: docker compose up -d dlq-service

set -euo pipefail

API_GATEWAY="${API_GATEWAY:-https://localhost:8448}"
ADMIN_TOKEN="${ADMIN_TOKEN:-changeme}"

echo "=== DLQ Messages ==="
curl -sk "${API_GATEWAY}/v1/messages/dlq" \
  -H "x-api-key: ${ADMIN_TOKEN}" | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "=== DLQ Stats ==="
curl -sk "${API_GATEWAY}/v1/messages/dlq" \
  -H "x-api-key: ${ADMIN_TOKEN}" | python3 -c "
import sys, json
data = json.load(sys.stdin)
stats = data.get('stats', {})
print(f\"Pending: {stats.get('pending', 'N/A')}\")
print(f\"Retry Rate: {stats.get('retryRate', 'N/A')}\")
print(f\"Total Size: {stats.get('totalSize', 'N/A')}\")
" 2>/dev/null || echo "Could not parse stats"

echo ""
echo "=== To retry a message (replace <id>) ==="
echo "curl -sk ${API_GATEWAY}/v1/messages/dlq/<id>/retry -X POST -H 'x-api-key: ${ADMIN_TOKEN}'"

echo ""
echo "=== To purge all DLQ messages ==="
echo "curl -sk ${API_GATEWAY}/v1/messages/dlq -X DELETE -H 'x-api-key: ${ADMIN_TOKEN}'"
