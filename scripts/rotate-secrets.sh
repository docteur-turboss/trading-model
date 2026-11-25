#!/usr/bin/env bash
# Rotates application secrets of trading-model-secrets, by hand (no CronJob does it).
# Usage: bash scripts/rotate-secrets.sh [--component tokens|mysql|migrator|retention|exporter|all]
#   tokens   AUTH_TOKENS           -> api-gateway (only the key API_KEY_NAME is replaced, the others kept;
#            ADR-0059 `name:scopes:secret`). The new key is written to a 0600 file, path logged.
#   all      tokens (mysql only when named)
#   mysql    MYSQL_PASSWORD (user scraper) -> financial-scraper, no downtime: ALTER USER ... RETAIN CURRENT PASSWORD,
#            Secret, restart, DISCARD OLD PASSWORD
#   migrator | retention | exporter   same scheme for MYSQL_MIGRATE_PASSWORD / MYSQL_RETENTION_PASSWORD /
#            MYSQL_EXPORTER_PASSWORD (Jobs and CronJob read the Secret when they start; the exporter
#            sidecars restart with StatefulSet mysql)
# Other database passwords (other MYSQL_*, MONGO_ROOT_PASSWORD, redis, REDIS_*_PASSWORD) are refused: see
# docs/deployment/sealed-secrets.md "Rotate a database password".
# Env: DRY_RUN=true (no kubeseal merge, apply or restart), NAMESPACE, SEALED_SECRETS_FILE.
# The new value is merged into SEALED_SECRETS_FILE (kubeseal --merge-into), never printed.

set -euo pipefail

DRY_RUN=${DRY_RUN:-false}
NAMESPACE=${NAMESPACE:-trading-model}
# Sealed Secrets controller installed by scripts/install-sealed-secrets.sh (ADR-0035).
CONTROLLER_NAMESPACE=${CONTROLLER_NAMESPACE:-sealed-secrets}
CONTROLLER_NAME=${CONTROLLER_NAME:-sealed-secrets-controller}
SEALED_SECRETS_FILE=${SEALED_SECRETS_FILE:-deploy/k8s/secrets/trading-model-sealed-secrets.yaml}
WAIT_TRIES=${WAIT_TRIES:-30}
# Gateway API key `name:scopes:secret` (ADR-0059); only the entry named API_KEY_NAME is replaced.
API_KEY_NAME=${API_KEY_NAME:-ops}
API_KEY_SCOPES=${API_KEY_SCOPES:-read}

log() { echo "[rotate-secrets] $(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }
die() { echo "[rotate-secrets] ERROR: $*" >&2; exit 1; }

# Secret values travel through 0600 files, never argv (visible in ps), removed on exit.
TMP_FILES=()
trap 'rm -f "${TMP_FILES[@]}"' EXIT
tmpfile() { local f; f=$(umask 077; mktemp); TMP_FILES+=("$f"); echo "$f"; }

# Keep every AUTH_TOKENS entry except the one named $API_KEY_NAME, then add the new key ($1).
merge_tokens() {
  local live entry kept=""
  live=$(kubectl get secret trading-model-secrets -n "$NAMESPACE" -o 'jsonpath={.data.AUTH_TOKENS}' | base64 -d)
  local IFS=,
  for entry in $live; do
    [ -z "$entry" ] || [ "${entry%%:*}" = "$API_KEY_NAME" ] || kept="${kept}${entry},"
  done
  printf '%s%s' "$kept" "$1"
}

# Database steps of rotate_secret: $1 = file holding the new password (fed on stdin, never argv).
MYSQL_USER=scraper # MySQL user being rotated, set by mysql_rotate
PRE_HOOK="" # runs before the Secret is applied: adds the new password, the old one stays valid
POST_HOOK="" # runs after the consumers restarted: removes the old password

mysql_pod() {
  local pod
  pod=$(kubectl get service -n "$NAMESPACE" mysql-primary -o 'jsonpath={.spec.selector.statefulset\.kubernetes\.io/pod-name}')
  [ -n "$pod" ] || die "no pod behind the mysql-primary Service"
  echo "$pod"
}
mysql_alter() { # $1 file, $2 clause ($p = the password read from the file)
  local sql="ALTER USER '$MYSQL_USER'@'%' $2"
  kubectl exec -i -n "$NAMESPACE" "$(mysql_pod)" -c mysql -- sh -c     "IFS= read -r p; echo \"$sql;\" | MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql --user=root" <"$1"
}
mysql_add() {
  # RETAIN CURRENT on a user that already has a secondary password would discard the real old one.
  local has
  has=$(kubectl exec -n "$NAMESPACE" "$(mysql_pod)" -c mysql -- sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql --user=root -N -e \"SELECT JSON_EXTRACT(User_attributes,'\\$.additional_password') IS NOT NULL FROM mysql.user WHERE User='$MYSQL_USER' AND Host='%'\"")
  [ "$has" = 0 ] || die "${MYSQL_USER} already has a secondary password (an earlier rotation stopped midway): check which value the live Secret holds, run ALTER USER '${MYSQL_USER}'@'%' DISCARD OLD PASSWORD by hand, then rerun"
  mysql_alter "$1" "IDENTIFIED BY '\$p' RETAIN CURRENT PASSWORD"
}
mysql_discard() { mysql_alter "$1" "DISCARD OLD PASSWORD"; }

# $1 Secret key, $2 random bytes, $3 value prefix, rest: workloads (kind/name) restarted to read the key
rotate_secret() {
  local key="$1" bytes="$2" prefix="$3" deployment
  shift 3
  log "Rotating ${key} (restarts: $*)"
  if [ "$DRY_RUN" = true ]; then
    log "[DRY-RUN] Would: generate ${key}, merge into ${SEALED_SECRETS_FILE}, apply, restart $*"
    return
  fi

  [ -f "$SEALED_SECRETS_FILE" ] || die "${SEALED_SECRETS_FILE} not found: set SEALED_SECRETS_FILE to the sealed file of the overlay"
  if grep -q CHANGE_ME "$SEALED_SECRETS_FILE"; then
    die "${SEALED_SECRETS_FILE} holds placeholders, the controller cannot decrypt it: set SEALED_SECRETS_FILE to the sealed file of the overlay (docs/deployment/sealed-secrets.md)"
  fi

  local new_value b64 entry value_file secret_file
  entry="${prefix}$(openssl rand -hex "$bytes")"
  new_value="$entry"
  if [ "$key" = AUTH_TOKENS ]; then
    new_value=$(merge_tokens "$entry")
    value_file=$(umask 077; mktemp)
    printf '%s\n' "$entry" >"$value_file"
    log "New API key (${API_KEY_NAME}) written to ${value_file} (0600): hand it over, then delete the file"
  fi
  secret_file=$(tmpfile)
  printf '%s' "$new_value" >"$secret_file"
  # kubeseal merges the key into the versioned file; the value never reaches argv.
  kubectl create secret generic trading-model-secrets \
    --namespace "$NAMESPACE" \
    --from-file="${key}=${secret_file}" \
    --dry-run=client -o yaml |
    kubeseal --controller-namespace "$CONTROLLER_NAMESPACE" \
      --controller-name "$CONTROLLER_NAME" \
      --merge-into "$SEALED_SECRETS_FILE"
  # The controller rewrites Secret.data from encryptedData: a live key absent from the file is erased.
  # (SEALED_SECRETS_FILE stays merged locally; add the missing keys with kubeseal --merge-into, then rerun.)
  local live_keys file_keys gone
  live_keys=$(kubectl get secret trading-model-secrets -n "$NAMESPACE" -o 'go-template={{range $k, $v := .data}}{{$k}} {{end}}' | tr ' ' '
' | sed '/^$/d' | sort)
  file_keys=$(awk '/^ *(encryptedData|stringData|data):[[:space:]]*$/ { match($0, /^ */); ind = RLENGTH; on = 1; next }
    on && /^[[:space:]]*(#|$)/ { next }
    on { match($0, /^ */); if (RLENGTH <= ind) { on = 0; next } sub(/^ */, ""); sub(/:.*/, ""); print }' "$SEALED_SECRETS_FILE" | sort)
  gone=$(comm -23 <(echo "$live_keys") <(echo "$file_keys") | paste -sd ' ' -)
  [ -z "$gone" ] || die "${SEALED_SECRETS_FILE} has no entry for live key ${gone}: applying it would erase that key from trading-model-secrets. Add the missing keys (kubeseal --merge-into, docs/deployment/sealed-secrets.md); nothing applied"
  [ -z "$PRE_HOOK" ] || "$PRE_HOOK" "$secret_file"
  kubectl apply -n "$NAMESPACE" -f "$SEALED_SECRETS_FILE"

  # Restarting before the controller decrypts would reload the old value.
  b64=$(printf '%s' "$new_value" | base64 | tr -d '\n')
  local i live=""
  for i in $(seq 1 "$WAIT_TRIES"); do
    live=$(kubectl get secret trading-model-secrets -n "$NAMESPACE" -o "jsonpath={.data.${key}}")
    [ "$live" = "$b64" ] && break
    sleep 2
  done
  [ "$live" = "$b64" ] || die "${key} not updated in the live Secret: the controller did not decrypt ${SEALED_SECRETS_FILE}"

  for deployment in "$@"; do
    kubectl rollout restart "$deployment" -n "$NAMESPACE"
  done
  for deployment in "$@"; do
    kubectl rollout status "$deployment" -n "$NAMESPACE" --timeout=120s
  done
  # Reached only when every consumer is rolled out on the new password.
  [ -z "$POST_HOOK" ] || "$POST_HOOK" "$secret_file"
  log "${key} rotated"
}

mysql_rotate() { # $1 MySQL user, $2 Secret key, rest: workloads restarted
  MYSQL_USER=$1 PRE_HOOK=mysql_add POST_HOOK=mysql_discard rotate_secret "$2" 24 "" "${@:3}"
}

rotate_component() {
  case "$1" in
    tokens) rotate_secret AUTH_TOKENS 24 "${API_KEY_NAME}:${API_KEY_SCOPES}:" deployment/api-gateway ;;
    mysql) mysql_rotate scraper MYSQL_PASSWORD deployment/financial-scraper deployment/financial-scraper-collector ;;
    migrator) mysql_rotate migrator MYSQL_MIGRATE_PASSWORD ;;
    retention) mysql_rotate retention MYSQL_RETENTION_PASSWORD ;;
    exporter) mysql_rotate exporter MYSQL_EXPORTER_PASSWORD statefulset/mysql ;;
    *) die "unknown component '$1'" ;;
  esac
}

COMPONENT=all
USAGE="Usage: $0 [--component tokens|mysql|migrator|retention|exporter|all]"
if [ $# -gt 0 ]; then
  [ $# -eq 2 ] && [ "$1" = --component ] || { echo "$USAGE" >&2; exit 1; }
  COMPONENT="$2"
fi

case "$COMPONENT" in
  tokens | mysql | migrator | retention | exporter) rotate_component "$COMPONENT" ;;
  all) for c in tokens; do rotate_component "$c"; done ;;
  MYSQL_* | MONGO_ROOT_PASSWORD | REDIS_* | redis | mongo)
    die "this database password is not rotated by this script (Redis: ACL rights for a rotation identity are not granted, ADR-0047): follow 'Rotate a database password' in docs/deployment/sealed-secrets.md" ;;
  *) echo "$USAGE" >&2; exit 1 ;;
esac
log "Secret rotation complete"
