#!/usr/bin/env bash
# Applies the pending MySQL migrations in a namespace through the db-migrate Job.
# The migrations are in the db-migrate image (deploy/migrate, released by
# release.yml): nothing is installed at run time. Used by deploy.yml.
#   MIGRATE_IMAGE=<registry>/db-migrate@sha256:... run-migrations.sh <namespace> [user-only]
# `user-only` provisions the `migrator` user and stops (used by migrate-down).
# The key MYSQL_MIGRATE_PASSWORD must be in Secret trading-model-secrets before
# the user job runs: a cluster deployed before it existed does not have it
# (staging: the overlay that carries it is applied after the migrations).
# SEALED_SECRETS_FILE=<SealedSecret manifest> (production): applied first when the
# key is missing, then waited for (the controller creates the Secret).
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

# Prints the requested field of trading-model-secrets. A missing Secret prints nothing;
# any other read error (RBAC, API) is fatal: it must not pass as "no key" (ADR-0017).
read_secret() {
  local out err
  err=$(mktemp)
  if out=$(kubectl get secret trading-model-secrets -n "$NS" "$@" 2>"$err"); then
    rm -f "$err"; printf '%s' "$out"; return 0
  fi
  if grep -q NotFound "$err"; then rm -f "$err"; return 0; fi
  echo "::error::cannot read Secret trading-model-secrets in $NS: $(cat "$err")" >&2
  rm -f "$err"; return 1
}

require_migrate_password() {
  local v i live
  v=$(read_secret -o jsonpath='{.data.MYSQL_MIGRATE_PASSWORD}') || exit 1
  [ -n "$v" ] && return 0
  if [ -n "${SEALED_SECRETS_FILE:-}" ]; then
    # Production: the SealedSecret is otherwise applied with the overlay, after the migrations.
    # The controller rewrites Secret.data from this file: a key of the live Secret
    # absent from encryptedData would be erased (MYSQL_ROOT_PASSWORD, SIGNING_SECRET...).
    live=$(read_secret -o go-template='{{range $k, $v := .data}}{{$k}} {{end}}') || exit 1
    for k in $live; do
      if ! grep -Eq "^[[:space:]]+$k:" "$SEALED_SECRETS_FILE"; then
        echo "::error::$SEALED_SECRETS_FILE has no entry for live key $k: applying it would erase that key from trading-model-secrets. Add the missing keys (kubeseal --merge-into, docs/deployment/sealed-secrets.md)."
        exit 1
      fi
    done
    echo "MYSQL_MIGRATE_PASSWORD missing: applying $SEALED_SECRETS_FILE before the migrations"
    kubectl apply -n "$NS" -f "$SEALED_SECRETS_FILE"
    for i in $(seq 1 "${SEALED_WAIT_TRIES:-30}"); do
      v=$(read_secret -o jsonpath='{.data.MYSQL_MIGRATE_PASSWORD}') || exit 1
      [ -n "$v" ] && return 0
      sleep 2
    done
  fi
  if [ "${SEED_MIGRATE_PASSWORD:-}" = true ]; then
    echo "MYSQL_MIGRATE_PASSWORD missing from trading-model-secrets: seeding a random one (the overlay replaces it later, the user job follows)"
    kubectl patch secret trading-model-secrets -n "$NS" --type merge -p "{\"stringData\":{\"MYSQL_MIGRATE_PASSWORD\":\"$(openssl rand -hex 16)\"}}"
    return 0
  fi
  echo "::error::Secret trading-model-secrets has no MYSQL_MIGRATE_PASSWORD (staging: rerun with SEED_MIGRATE_PASSWORD=true). Production: ADD the key to deploy/k8s/secrets/trading-model-sealed-secrets.yaml WITHOUT dropping the others: kubectl create secret generic trading-model-secrets -n $NS --from-literal=MYSQL_MIGRATE_PASSWORD=<value> --dry-run=client -o yaml | kubeseal --controller-namespace sealed-secrets --merge-into deploy/k8s/secrets/trading-model-sealed-secrets.yaml. The file must end with ALL keys: a single-key SealedSecret erases MYSQL_ROOT_PASSWORD, SIGNING_SECRET etc. from the live Secret (init-sealed-secrets.sh also draws random values for every key not provided, MYSQL_ROOT_PASSWORD included, which would no longer match the initialised MySQL). Then rerun (docs/deployment/sealed-secrets.md)."
  exit 1
}

require_migrate_password
run_job db-migrate-user "$JOBS/migration-user-job.yaml"
[ "${2:-}" = user-only ] && exit 0
run_job db-migrate "$JOBS/migration-job.yaml"
