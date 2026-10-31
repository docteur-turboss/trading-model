#!/bin/sh
# Starts the SPIRE agent with the join token minted by spire-bootstrap. On a
# restart the agent reuses the SVID stored in its data dir and ignores the token.
set -eu

TOKEN_FILE=/run/spire/bootstrap/join_token
[ -s "$TOKEN_FILE" ] || { echo "missing $TOKEN_FILE: did spire-bootstrap run?"; exit 1; }
exec /opt/spire/bin/spire-agent run -config /etc/spire/agent.conf -joinToken "$(cat "$TOKEN_FILE")"
