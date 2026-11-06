#!/usr/bin/env bash
# Applies the pending MySQL migrations (scripts/migrations) in a namespace
# through the db-migrate Job. Used by deploy.yml.
#   run-migrations.sh <namespace>
set -euo pipefail

NS="${1:?usage: run-migrations.sh <namespace>}"

# A ready mysql-0 is not enough: while mysql-cluster-init runs START
# GROUP_REPLICATION, the server is super_read_only. A migration that runs then
# fails halfway, and its retry fails on what the first try already applied.
# The Job may be gone on an old namespace (deleted by hand): nothing to wait for.
if kubectl get job mysql-cluster-init -n "$NS" >/dev/null 2>&1; then
  # Poll both conditions: `kubectl wait --for=condition=complete` would sit
  # out its whole timeout on a Job that has already failed.
  state=""
  for _ in $(seq 60); do
    state=$(kubectl get job mysql-cluster-init -n "$NS" \
      -o jsonpath='{range .status.conditions[?(@.status=="True")]}{.type} {end}')
    case "$state" in *Complete*|*Failed*) break ;; esac
    sleep 5
  done
  if [[ "$state" != *Complete* ]]; then
    echo "::error::MySQL group replication bootstrap (mysql-cluster-init) failed or timed out"
    kubectl logs -n "$NS" job/mysql-cluster-init --tail=50 || true
    exit 1
  fi
fi

kubectl create configmap migration-files -n "$NS" \
  --from-file=migrate.mjs=scripts/migrate.mjs \
  --from-file=scripts/migrations \
  --dry-run=client -o yaml | kubectl apply -f -
# A Job runs once: drop the previous run (kept ttlSecondsAfterFinished) so a
# new deploy applies the new migrations.
kubectl delete job db-migrate -n "$NS" --ignore-not-found
kubectl apply -n "$NS" -f deploy/k8s/jobs/migration-job.yaml
bash "$(dirname "${BASH_SOURCE[0]}")/wait-job.sh" "$NS" db-migrate 180
