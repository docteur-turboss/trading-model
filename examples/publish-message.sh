#!/usr/bin/env bash
# Example: Publish a market data event
# Prerequisites: docker compose up -d, TLS certs generated

set -euo pipefail

API_GATEWAY="${API_GATEWAY:-https://localhost:8448}"
ADMIN_TOKEN="${ADMIN_TOKEN:-changeme}"
CERTS_DIR="${CERTS_DIR:-./certs}"

echo "=== Publishing a market data event ==="
curl -sk "${API_GATEWAY}/v1/broker/message" \
  -H "x-api-key: ${ADMIN_TOKEN}" \
  -H 'Content-Type: application/json' \
  -d '{
    "targetService": "audit-logger-service",
    "payload": {
      "symbol": "BTCUSDT",
      "price": 50000.0,
      "volume": 12.5
    },
    "deliveryMode": "at-most-once",
    "metadata": {
      "topic": "market.trade.recent.fetch",
      "eventType": "market.trade.recent.fetch",
      "schemaVersion": "1.0.0",
      "publisher": {
        "serviceName": "example-script",
        "instanceId": "demo-001"
      },
      "delivery": {
        "mode": "at-most-once",
        "ttl": 60000
      }
    }
  }'

echo ""
echo "=== Message published (204 No Content) ==="

echo ""
echo "=== Viewing recent audit events ==="
curl -sk "${API_GATEWAY}/v1/audit/events?limit=3" \
  -H "x-api-key: ${ADMIN_TOKEN}" | python3 -m json.tool 2>/dev/null || cat
