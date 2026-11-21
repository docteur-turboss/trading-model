#!/bin/sh
# Starts the SPIRE agent with the join token minted by spire-bootstrap. On a
# restart the agent reuses the SVID stored in its data dir and ignores the token.
set -eu

TOKEN_FILE=/run/spire/bootstrap/join_token
[ -s "$TOKEN_FILE" ] || { echo "missing $TOKEN_FILE: did spire-bootstrap run?"; exit 1; }
DATA=/run/spire/agent-data
# Expired cached SVID: the agent must re-attest but would keep its stale cached bundle over
# trust_bundle_path ("unknown authority" forever). Drop the cache to restart from bundle.pem.
# shortcut: agent-data.json mtime stands for SVID age (4 h TTL, ADR-0065; a later rewrite hides an expiry), read notAfter if that bites.
if [ -f "$DATA/agent-data.json" ] && [ -n "$(find "$DATA/agent-data.json" -mmin +240)" ]; then
  echo "cached SVID expired: removing agent state to re-attest from bundle.pem"
  rm -f "$DATA/agent-data.json" "$DATA/keys.json"
fi
if [ ! -f "$DATA/agent-data.json" ] && [ -n "$(find "$TOKEN_FILE" -mmin +60)" ]; then
  echo "join token older than 1 h: run 'docker compose up -d spire-bootstrap spire-agent'"; exit 1
fi
exec /opt/spire/bin/spire-agent run -config /etc/spire/agent.conf -joinToken "$(cat "$TOKEN_FILE")"
