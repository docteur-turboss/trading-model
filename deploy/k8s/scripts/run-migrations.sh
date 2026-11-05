#!/usr/bin/env bash
# Applies the pending MySQL migrations in a namespace through the db-migrate Job.
# The migrations are in the db-migrate image (deploy/migrate, released by
# release.yml): nothing is installed at run time. Used by deploy.yml.
#   MIGRATE_IMAGE=<registry>/db-migrate@sha256:... run-migrations.sh <namespace> [user-only]
# `user-only` provisions the `migrator` user and stops (used by migrate-down).
# The key MYSQL_MIGRATE_PASSWORD must be in Secret trading-model-secrets before
# the user job runs: a cluster deployed before it existed does not have it
# (staging: the overlay that carries it is applied after the migrations).
# SEED_MIGRATE_PASSWORD=true (staging only) creates it with a random value when
# missing; otherwise a missing key stops here with an explicit error.
# MIGRATE_IMAGE pins the image (deploy.yml passes the digest of the release);
# unset, the manifest's ghcr.io/trading-model/db-migrate:latest is used.
set -euo pipefail

NS="${1:?usage: run-migrations.sh <namespace> [user-only]}"
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

require_migrate_password() {
  local v
  v=$(kubectl get secret trading-model-secrets -n "$NS" -o jsonpath='{.data.MYSQL_MIGRATE_PASSWORD}' 2>/dev/null || true)
  [ -n "$v" ] && return 0
  if [ "${SEED_MIGRATE_PASSWORD:-}" = true ]; then
    echo "MYSQL_MIGRATE_PASSWORD missing from trading-model-secrets: seeding a random one (the overlay replaces it later, the user job follows)"
    kubectl patch secret trading-model-secrets -n "$NS" --type merge       -p "{\"stringData\":{\"MYSQL_MIGRATE_PASSWORD\":\"$(openssl rand -hex 16)\"}}"
    return 0
  fi
  echo "::error::Secret trading-model-secrets has no MYSQL_MIGRATE_PASSWORD. Seal it first (bash scripts/init-sealed-secrets.sh, see docs/deployment/sealed-secrets.md), then rerun."
  exit 1
}

require_migrate_password
run_job db-migrate-user "$JOBS/migration-user-job.yaml"
[ "${2:-}" = user-only ] && exit 0
run_job db-migrate "$JOBS/migration-job.yaml"
