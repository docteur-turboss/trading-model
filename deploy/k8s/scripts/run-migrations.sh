#!/usr/bin/env bash
# Applies the pending MySQL migrations in a namespace through the db-migrate Job.
# The migrations are in the db-migrate image (deploy/migrate, released by
# release.yml): nothing is installed at run time. Used by deploy.yml.
#   MIGRATE_IMAGE=<registry>/db-migrate@sha256:... run-migrations.sh <namespace> [user-only]
# `user-only` provisions the `migrator` user and stops (used by migrate-down).
# The key MYSQL_MIGRATE_PASSWORD must be in Secret trading-model-secrets before
# the user job runs: a cluster deployed before it existed does not have it
# (the overlay that carries it is applied after the migrations).
# SEALED_SECRETS_FILE=<SealedSecret manifest> (deploy.yml, both environments): applied first when it
# has a key the live Secret lacks, then waited for (the controller writes the Secret), so that
# db-migrate-user and the database pods the overlay restarts see every new key (issue #698).
# SEED_MIGRATE_PASSWORD=true (kind CI only: no Sealed Secrets controller) creates it with a random value when
# missing; otherwise a missing key stops here with an explicit error.
# MIGRATE_IMAGE pins the image (deploy.yml passes the digest of the release);
# unset, the manifest's ghcr.io/trading-model/db-migrate:latest is used.
set -euo pipefail

NS="${1:?usage: run-migrations.sh <namespace> [user-only]}"
JOBS="$(dirname "${BASH_SOURCE[0]}")/../jobs"

# Jobs run once: drop the previous runs (kept ttlSecondsAfterFinished) so a new
# deploy applies again. The user job is idempotent and runs as root; the
# migrations themselves run as the least-privilege `migrator` user.
# The Job's activeDeadlineSeconds is multiplied by DEPLOY_TIMEOUT_FACTOR like the
# wait-job.sh timeout: otherwise a slow cluster has the Job killed at its base
# deadline while still waited for (issue #760).
run_job() { # <job> <manifest>
  kubectl delete job "$1" -n "$NS" --ignore-not-found
  sed "s#ghcr.io/trading-model/db-migrate:latest#${MIGRATE_IMAGE:-ghcr.io/trading-model/db-migrate:latest}#" "$2" |
    sed "s#^\( *\)- name: DB_SSL_CA\$#\1- name: DB_SSL_VERIFY\n\1  value: '${TLS_VERIFY:-true}'\n&#" |
    awk -v f="${DEPLOY_TIMEOUT_FACTOR:-1}" '/^ *activeDeadlineSeconds: *[0-9]+ *$/ { sub(/[0-9]+ *$/, $2 * f) } 1' |
    kubectl apply -n "$NS" -f -
  bash "$(dirname "${BASH_SOURCE[0]}")/wait-job.sh" "$NS" "$1" 180
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

live_keys() { # one key of trading-model-secrets per line, sorted
  local out
  out=$(read_secret -o go-template='{{range $k, $v := .data}}{{$k}} {{end}}') || return 1
  tr ' ' '\n' <<<"$out" | sed '/^$/d' | sort
}

file_keys() { # keys of the data / stringData / encryptedData blocks of SEALED_SECRETS_FILE, sorted
  awk '/^ *(encryptedData|stringData|data):[[:space:]]*$/ { match($0, /^ */); ind = RLENGTH; on = 1; next }
    on && /^[[:space:]]*(#|$)/ { next }
    on { match($0, /^ */); if (RLENGTH <= ind) { on = 0; next } sub(/^ */, ""); sub(/:.*/, ""); print }' "$SEALED_SECRETS_FILE" | sort
}

keys_not_in() { # <sorted keys> <sorted keys>: those of the first list absent from the second, space-separated
  comm -23 <(echo "$1") <(echo "$2") | paste -sd ' ' -
}

# The SealedSecret is otherwise applied with the overlay, after the migrations:
# a key it adds (MYSQL_MIGRATE_PASSWORD, MYSQL_EXPORTER_PASSWORD...) would be
# missing when db-migrate-user runs, and missing from the database pods that the
# overlay restarts before the controller decrypts it (issue #698). So it is
# applied first whenever it carries a key the live Secret lacks, and waited for.
apply_new_sealed_keys() {
  [ -n "${SEALED_SECRETS_FILE:-}" ] || return 0
  local live file gone new
  live=$(live_keys) || exit 1
  file=$(file_keys) || exit 1
  # The controller rewrites Secret.data from this file: a key of the live Secret
  # absent from encryptedData would be erased (MYSQL_ROOT_PASSWORD, SIGNING_SECRET...).
  gone=$(keys_not_in "$live" "$file")
  if [ -n "$gone" ]; then
    echo "::error::$SEALED_SECRETS_FILE has no entry for live key $gone: applying it would erase that key from trading-model-secrets. Add the missing keys (kubeseal --merge-into, docs/deployment/sealed-secrets.md)."
    exit 1
  fi
  new=$(keys_not_in "$file" "$live")
  [ -n "$new" ] || return 0
  echo "trading-model-secrets lacks $new: applying $SEALED_SECRETS_FILE before the migrations"
  kubectl apply -n "$NS" -f "$SEALED_SECRETS_FILE"
  for _ in $(seq 1 "${SEALED_WAIT_TRIES:-30}"); do
    live=$(live_keys) || exit 1
    new=$(keys_not_in "$file" "$live")
    [ -z "$new" ] && return 0
    sleep 2
  done
  echo "::error::$new still missing from trading-model-secrets after applying $SEALED_SECRETS_FILE: the Sealed Secrets controller did not decrypt it (kubectl -n $NS describe sealedsecret trading-model-secrets)."
  exit 1
}

require_migrate_password() {
  local v
  v=$(read_secret -o jsonpath='{.data.MYSQL_MIGRATE_PASSWORD}') || exit 1
  [ -n "$v" ] && return 0
  if [ "${SEED_MIGRATE_PASSWORD:-}" = true ]; then
    echo "MYSQL_MIGRATE_PASSWORD missing from trading-model-secrets: seeding a random one (the overlay replaces it later, the user job follows)"
    kubectl patch secret trading-model-secrets -n "$NS" --type merge -p "{\"stringData\":{\"MYSQL_MIGRATE_PASSWORD\":\"$(openssl rand -hex 16)\"}}"
    return 0
  fi
  echo "::error::Secret trading-model-secrets has no MYSQL_MIGRATE_PASSWORD (staging: rerun with SEED_MIGRATE_PASSWORD=true). Production: ADD the key to deploy/k8s/secrets/trading-model-sealed-secrets.yaml WITHOUT dropping the others: kubectl create secret generic trading-model-secrets -n $NS --from-literal=MYSQL_MIGRATE_PASSWORD=<value> --dry-run=client -o yaml | kubeseal --controller-namespace sealed-secrets --merge-into deploy/k8s/secrets/trading-model-sealed-secrets.yaml. The file must end with ALL keys: a single-key SealedSecret erases MYSQL_ROOT_PASSWORD, SIGNING_SECRET etc. from the live Secret (init-sealed-secrets.sh also draws random values for every key not provided, MYSQL_ROOT_PASSWORD included, which would no longer match the initialised MySQL). Then rerun (docs/deployment/sealed-secrets.md)."
  exit 1
}

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

apply_new_sealed_keys
require_migrate_password
# The jobs below mount the client certificate Secrets of cert-manager (issue #767), which the
# overlay (applied after the migrations) would otherwise create too late on an upgrade from a
# release without them: the pod would wait on a missing Secret until the Job deadline.
# Upgrade from a release without TLS: mysqld still serves its auto-generated certificate (the
# overlay rolls it after the migrations), which no client can verify. The jobs then use an
# encrypted but unverified session (ssl-mode=REQUIRED, DB_SSL_VERIFY=false) for this run only;
# the overlay re-applies VERIFY_IDENTITY (docs/deployment/MYSQL_TLS.md, "Upgrade").
TLS_VERIFY=true
kubectl get statefulset mysql -n "$NS" -o jsonpath='{.spec.template.spec.volumes[*].name}' 2>/dev/null |
  grep -qw mysql-tls || TLS_VERIFY=false
if [ "$TLS_VERIFY" = true ]; then
  kubectl apply -n "$NS" -f "$JOBS/../infra/mysql-tls.yaml"
else
  echo "mysql still serves its auto-generated certificate: migration jobs use ssl-mode=REQUIRED"
  sed 's/ssl-mode=VERIFY_IDENTITY/ssl-mode=REQUIRED/' "$JOBS/../infra/mysql-tls.yaml" | kubectl apply -n "$NS" -f -
fi
for s in mysql-client-root mysql-client-migrator mysql-client-retention; do
  for _ in $(seq 60); do
    kubectl get secret "$s" -n "$NS" >/dev/null 2>&1 && continue 2
    sleep 2
  done
  echo "::error::cert-manager did not issue Secret $s (kubectl describe certificate $s -n $NS)"
  exit 1
done

run_job db-migrate-user "$JOBS/migration-user-job.yaml"
[ "${2:-}" = user-only ] && exit 0
run_job db-migrate "$JOBS/migration-job.yaml"
# Again once the tables exist: the `retention` user is granted per table (ADR-0051),
# and on a new database the first run came before the migrations created them.
run_job db-migrate-user "$JOBS/migration-user-job.yaml"
