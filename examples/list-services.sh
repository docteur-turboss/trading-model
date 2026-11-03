#!/usr/bin/env bash
# Example: Inspect the service registry through the gateway
# Prerequisites: docker compose up -d (api-gateway, edge-proxy, discovery-server).
#
# Registration itself is not an external operation: only platform workloads
# register, each with its own SPIFFE SVID (address-manager does it on start).

set -euo pipefail

API_GATEWAY="${API_GATEWAY:-http://localhost:8449}"  # edge-proxy
ADMIN_TOKEN="${ADMIN_TOKEN:-changeme}"                # one of the gateway AUTH_TOKENS

# Pretty-prints JSON with jq when it is installed, raw output otherwise.
pretty() { if command -v jq >/dev/null 2>&1; then jq .; else cat; echo; fi; }
SERVICE="${1:-}"

if [ -z "${SERVICE}" ]; then
  echo "=== Registered services ==="
  curl -s "${API_GATEWAY}/v1/discovery-server/services" \
    -H "x-api-key: ${ADMIN_TOKEN}" | pretty
else
  echo "=== Instances of ${SERVICE} ==="
  curl -s "${API_GATEWAY}/v1/discovery-server/services/${SERVICE}" \
    -H "x-api-key: ${ADMIN_TOKEN}" | pretty
fi
