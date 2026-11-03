#!/bin/sh
# Idempotent SPIRE bootstrap for docker-compose (ADR-0011):
#   - registers one workload entry per spiffe-helper sidecar (Docker label selector)
#   - exports the server trust bundle and mints a join token for the agent
# Writes bundle.pem and join_token into /run/spire/bootstrap.
set -eu

SOCK=/run/spire/sockets/api.sock
OUT=/run/spire/bootstrap
SERVER=/opt/spire/bin/spire-server
TD=${SPIFFE_TD:-trading-model.local}
NS=${SPIFFE_NS:-trading-model}
AGENT_ID="spiffe://${TD}/ns/${NS}/sa/spire-agent"

for i in $(seq 1 30); do
  "$SERVER" healthcheck -socketPath "$SOCK" >/dev/null 2>&1 && break
  echo "Waiting for spire-server ($i/30)..."
  sleep 2
done
"$SERVER" healthcheck -socketPath "$SOCK"

# <compose helper service suffix>:<service name in the SPIFFE ID and ACL>
for pair in \
  discovery:discovery-server message:message-manager scraper:financial-scraper \
  trainer:trader-trainer gateway:api-gateway audit:audit-logger dlq:dlq-service \
  edge:edge-proxy prometheus:prometheus; do
  helper=${pair%%:*}
  service=${pair#*:}
  id="spiffe://${TD}/ns/${NS}/sa/${service}"
  if "$SERVER" entry show -socketPath "$SOCK" -spiffeID "$id" | grep -q "$id"; then
    echo "entry exists: $id"
  else
    "$SERVER" entry create -socketPath "$SOCK" \
      -spiffeID "$id" \
      -parentID "$AGENT_ID" \
      -selector "docker:label:com.docker.compose.service:spiffe-helper-${helper}" \
      -dns "$service" \
      -x509SVIDTTL 3600
  fi
done

"$SERVER" bundle show -socketPath "$SOCK" > "$OUT/bundle.pem"
# A fresh token on every run: the agent only consumes it when it has no stored SVID.
"$SERVER" token generate -socketPath "$SOCK" -spiffeID "$AGENT_ID" -ttl 3600 \
  | sed -n 's/^Token: //p' > "$OUT/join_token"
[ -s "$OUT/join_token" ] || { echo "join token generation failed"; exit 1; }
chmod 0644 "$OUT/bundle.pem" "$OUT/join_token"
echo "SPIRE bootstrap done."
