#!/usr/bin/env bash
# Applies the pending MySQL migrations (scripts/migrations) in a namespace
# through the db-migrate Job. Used by deploy.yml.
#   run-migrations.sh <namespace>
set -euo pipefail

NS="${1:?usage: run-migrations.sh <namespace>}"

kubectl create configmap migration-files -n "$NS" \
  --from-file=migrate.mjs=scripts/migrate.mjs \
  --from-file=scripts/migrations \
  --dry-run=client -o yaml | kubectl apply -f -
# A Job runs once: drop the previous run (kept ttlSecondsAfterFinished) so a
# new deploy applies the new migrations.
kubectl delete job db-migrate -n "$NS" --ignore-not-found
kubectl apply -n "$NS" -f deploy/k8s/jobs/migration-job.yaml
if ! kubectl wait --for=condition=complete job/db-migrate -n "$NS" --timeout=180s; then
  echo "::error::Database migration job failed or timed out"
  kubectl logs -n "$NS" job/db-migrate --tail=50
  exit 1
fi
