#!/usr/bin/env bash
# Applies the pending MySQL migrations in a namespace through the db-migrate Job.
# The migrations are in the db-migrate image (deploy/migrate, released by
# release.yml): nothing is installed at run time. Used by deploy.yml.
#   MIGRATE_IMAGE=<registry>/db-migrate@sha256:... run-migrations.sh <namespace>
# MIGRATE_IMAGE pins the image (deploy.yml passes the digest of the release);
# unset, the manifest's ghcr.io/trading-model/db-migrate:latest is used.
set -euo pipefail

NS="${1:?usage: run-migrations.sh <namespace>}"
JOBS="$(dirname "${BASH_SOURCE[0]}")/../jobs"

# Jobs run once: drop the previous runs (kept ttlSecondsAfterFinished) so a new
# deploy applies again. The user job is idempotent and runs as root; the
# migrations themselves run as the least-privilege `migrator` user.
run_job() { # <job> <manifest>
  kubectl delete job "$1" -n "$NS" --ignore-not-found
  if [ -n "${MIGRATE_IMAGE:-}" ]; then
    sed "s#ghcr.io/trading-model/db-migrate:latest#${MIGRATE_IMAGE}#" "$2" | kubectl apply -n "$NS" -f -
  else
    kubectl apply -n "$NS" -f "$2"
  fi
  if ! kubectl wait --for=condition=complete "job/$1" -n "$NS" --timeout=180s; then
    echo "::error::Job $1 failed or timed out"
    kubectl logs -n "$NS" "job/$1" --tail=50
    exit 1
  fi
}

run_job db-migrate-user "$JOBS/migration-user-job.yaml"
run_job db-migrate "$JOBS/migration-job.yaml"
