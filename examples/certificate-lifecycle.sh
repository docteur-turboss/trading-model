#!/usr/bin/env bash
# Example: Full mTLS certificate lifecycle
# Prerequisites: docker compose up -d certificate-authority, TLS certs generated

set -euo pipefail

CA_URL="${CA_URL:-https://localhost:8447}"
CERTS_DIR="${CERTS_DIR:-./certs}"
CERT="${CERTS_DIR}/client.crt"
KEY="${CERTS_DIR}/client-key.pem"

# Generate a test CSR
echo "=== Generating test CSR ==="
openssl req -new -newkey rsa:2048 -nodes -keyout /tmp/test-key.pem \
  -out /tmp/test.csr \
  -subj "/CN=test-service/O=trading-model" 2>/dev/null

CSR=$(cat /tmp/test.csr)

echo "=== Signing CSR ==="
RESPONSE=$(curl -sk --cert "${CERT}" --key "${KEY}" \
  "${CA_URL}/api/v1/certificate/sign" \
  -H 'Content-Type: application/json' \
  -d "{
    \"serviceId\": \"test-service\",
    \"csr\": \"${CSR}\",
    \"ttlMs\": 3600000
  }")

echo "${RESPONSE}" | python3 -m json.tool 2>/dev/null || echo "${RESPONSE}"

SERIAL=$(echo "${RESPONSE}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('serialNumber',''))" 2>/dev/null || echo "")

echo ""
echo "=== Getting certificate ==="
curl -sk --cert "${CERT}" --key "${KEY}" \
  "${CA_URL}/api/v1/certificate/test-service" | python3 -m json.tool 2>/dev/null || cat

echo ""
echo "=== Getting CRL ==="
curl -sk --cert "${CERT}" --key "${KEY}" \
  "${CA_URL}/api/v1/crl" | python3 -m json.tool 2>/dev/null || cat

if [ -n "${SERIAL}" ]; then
  echo ""
  echo "=== Revoking certificate (${SERIAL}) ==="
  curl -sk --cert "${CERT}" --key "${KEY}" \
    "${CA_URL}/api/v1/certificate/revoke" \
    -H 'Content-Type: application/json' \
    -d "{\"serialNumber\": \"${SERIAL}\", \"reason\": \"keyCompromise\"}" | python3 -m json.tool 2>/dev/null || cat
fi

# Cleanup
rm -f /tmp/test-key.pem /tmp/test.csr
