#!/bin/sh
# SPIRE registration entries for Kubernetes (ADR-0011). Runs as a sidecar of
# the SPIRE server (shared server API socket) and reconciles idempotently at
# start and every RECONCILE_INTERVAL_SECONDS, so entries come back if the
# datastore is reset.
#   - node alias: every agent of the cluster (k8s_psat, service account
#     spire-agent of AGENT_NAMESPACE) maps to AGENT_ID
#   - one workload entry per service account of the application namespace
set -eu

SOCK=${SPIRE_SERVER_SOCKET:-/run/spire/server-sockets/api.sock}
SERVER=/opt/spire/bin/spire-server
TD=${SPIFFE_TD:-trading-model.local}
NS=${POD_NAMESPACE:?POD_NAMESPACE is required (downward API)}
AGENT_NS=${SPIRE_AGENT_NAMESPACE:-trading-model-node}
CLUSTER=${SPIRE_CLUSTER_NAME:-trading-model}
INTERVAL=${RECONCILE_INTERVAL_SECONDS:-600}
SERVICE_ACCOUNTS=${SPIFFE_SERVICE_ACCOUNTS:-"edge-proxy api-gateway audit-logger discovery-server dlq-service financial-scraper decision-consumer message-manager model-evaluator risk-execution trader-trainer prometheus blackbox-exporter"}
# <service account>:<SPIFFE name>: a dedicated ServiceAccount that keeps the
# SPIFFE ID of its service (ACLs and discovery see no new identity). The
# financial-scraper-collector pod holds the Lease right (issue #714).
SERVICE_ACCOUNT_ALIASES=${SPIFFE_SERVICE_ACCOUNT_ALIASES:-"financial-scraper-collector:financial-scraper"}
AGENT_ID="spiffe://${TD}/ns/${AGENT_NS}/sa/spire-agent"

entry_exists() {
  "$SERVER" entry show -socketPath "$SOCK" -spiffeID "$1" | grep -q "$1"
}

# ADR-0065: 4 h, as default_x509_svid_ttl of server.conf (CertificateExpiry fires below 90 min left).
SVID_TTL=14400

# upsert_entry "<entry show output>" <entry flags...>: creates the entry, or moves an existing
# one to SVID_TTL (entries made before ADR-0065 carry 1 h). `entry update` replaces every field.
upsert_entry() {
  shown=$1
  shift
  entry_id=$(printf '%s\n' "$shown" | sed -n 's/^Entry ID *: //p' | head -n 1)
  if [ -z "$entry_id" ]; then
    "$SERVER" entry create -socketPath "$SOCK" "$@" -x509SVIDTTL "$SVID_TTL"
  elif ! printf '%s\n' "$shown" | grep -q "^X509-SVID TTL *: ${SVID_TTL}\$"; then
    "$SERVER" entry update -socketPath "$SOCK" -entryID "$entry_id" "$@" -x509SVIDTTL "$SVID_TTL"
  fi
}

reconcile() {
  if ! entry_exists "$AGENT_ID"; then
    "$SERVER" entry create -socketPath "$SOCK" -node \
      -spiffeID "$AGENT_ID" \
      -selector "k8s_psat:cluster:${CLUSTER}" \
      -selector "k8s_psat:agent_ns:${AGENT_NS}" \
      -selector "k8s_psat:agent_sa:spire-agent"
  fi
  for sa in $SERVICE_ACCOUNTS; do
    id="spiffe://${TD}/ns/${NS}/sa/${sa}"
    # Filter on the selector too: an alias entry (financial-scraper-collector) shares the SPIFFE ID.
    upsert_entry "$("$SERVER" entry show -socketPath "$SOCK" -spiffeID "$id" -selector "k8s:sa:${sa}")" \
      -spiffeID "$id" \
      -parentID "$AGENT_ID" \
      -selector "k8s:ns:${NS}" \
      -selector "k8s:sa:${sa}" \
      -dns "$sa" || return 1
  done
  for alias in $SERVICE_ACCOUNT_ALIASES; do
    sa=${alias%%:*}
    name=${alias#*:}
    upsert_entry "$("$SERVER" entry show -socketPath "$SOCK" -selector "k8s:sa:${sa}")" \
      -spiffeID "spiffe://${TD}/ns/${NS}/sa/${name}" \
      -parentID "$AGENT_ID" \
      -selector "k8s:ns:${NS}" \
      -selector "k8s:sa:${sa}" \
      -dns "$name" || return 1
  done
  echo "SPIRE entries reconciled ($(echo "$SERVICE_ACCOUNTS" | wc -w) workloads)."
}

until "$SERVER" healthcheck -socketPath "$SOCK" >/dev/null 2>&1; do
  echo "Waiting for spire-server..."
  sleep 3
done

# A failed pass retries after RETRY_SECONDS, not INTERVAL: no entry means no SVID for any workload.
RETRY=${RETRY_SECONDS:-10}
while true; do
  if reconcile; then
    sleep "$INTERVAL"
  else
    echo "Reconciliation failed, retrying in ${RETRY}s"
    sleep "$RETRY"
  fi
done
