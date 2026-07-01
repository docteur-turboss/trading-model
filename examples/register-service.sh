#!/usr/bin/env bash
# Example: Register a mock service with the Discovery Server
# Prerequisites: docker compose up -d discovery-server, TLS certs generated

set -euo pipefail

DISCOVERY_URL="${DISCOVERY_URL:-https://localhost:8443}"
CERTS_DIR="${CERTS_DIR:-./certs}"
CERT="${CERTS_DIR}/client.crt"
KEY="${CERTS_DIR}/client-key.pem"

SERVICE_NAME="${1:-example-service}"
INSTANCE_ID="$(uuidgen 2>/dev/null || echo "inst-$(date +%s)")"

echo "=== Registering service: ${SERVICE_NAME} (${INSTANCE_ID}) ==="

RESPONSE=$(curl -sk --cert "${CERT}" --key "${KEY}" \
  "${DISCOVERY_URL}/api/services/register" \
  -H 'Content-Type: application/json' \
  -d "{
    \"name\": \"${SERVICE_NAME}\",
    \"version\": \"1.0.0\",
    \"host\": \"10.0.0.99\",
    \"port\": 9999,
    \"healthEndpoint\": \"/ping\"
  }")

echo "${RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${RESPONSE}"

TOKEN=$(echo "${RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")

if [ -n "${TOKEN}" ]; then
  echo ""
  echo "=== Sending heartbeat ==="
  curl -sk --cert "${CERT}" --key "${KEY}" \
    "${DISCOVERY_URL}/api/services/heartbeat" \
    -H 'Content-Type: application/json' \
    -H "x-instance-token: ${TOKEN}" \
    -d "{
      \"serviceName\": \"${SERVICE_NAME}\",
      \"instanceId\": \"${INSTANCE_ID}\",
      \"authToken\": \"${TOKEN}\"
    }"
  echo ""
fi

echo ""
echo "=== Listing all services ==="
curl -sk --cert "${CERT}" --key "${KEY}" \
  "${DISCOVERY_URL}/api/services" | python3 -m json.tool 2>/dev/null || cat
