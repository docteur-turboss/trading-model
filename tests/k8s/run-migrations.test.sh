#!/usr/bin/env bash
# deploy/k8s/scripts/run-migrations.sh (issue #422) with a stub kubectl: the
# MYSQL_MIGRATE_PASSWORD guard on a cluster that has the key, one that lacks it
# (production: explicit error before any Job; staging: seeded), and `user-only`.
#   bash tests/k8s/run-migrations.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
RUN="$ROOT/deploy/k8s/scripts/run-migrations.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }

mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "$*" >>"$STUB_LOG"
if [ "$1" = get ] && [ "$2" = job ]; then exit 1; fi # no mysql-cluster-init Job
if [ "$1" = get ] && [ "$2" = secret ] && [ -n "${STUB_GET_ERR:-}" ]; then echo "$STUB_GET_ERR" >&2; exit 1; fi
if [ "$1" = get ] && [ "$2" = secret ] && [[ "$*" == *go-template* ]]; then printf '%s' "${STUB_LIVE_KEYS:-}"; exit 0; fi
if [ "$1" = get ] && [ "$2" = secret ]; then
  # STUB_KEY_AFTER_APPLY: the key shows up once the SealedSecret was applied
  if [ -n "${STUB_KEY_AFTER_APPLY:-}" ] && grep -q '^apply .*sealed' "$STUB_LOG"; then printf '%s' "$STUB_KEY_AFTER_APPLY"; else printf '%s' "${STUB_KEY:-}"; fi
  exit 0
fi
exit 0
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log"

run() { : >"$STUB_LOG"; set +e; OUT=$("$@" 2>&1); RC=$?; set -e; }

STUB_KEY=c2VjcmV0 run bash "$RUN" ns
{ [ $RC = 0 ] && grep -q 'job/db-migrate ' "$STUB_LOG" && grep -q 'job/db-migrate-user ' "$STUB_LOG"; } && ok "key present: both jobs run" || ko "key present"

STUB_KEY= run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'no MYSQL_MIGRATE_PASSWORD' <<<"$OUT" && ! grep -q 'apply\|wait' "$STUB_LOG"; } && ok "key missing (production): explicit error, no Job" || ko "key missing"

STUB_KEY= SEED_MIGRATE_PASSWORD=true run bash "$RUN" ns
{ [ $RC = 0 ] && grep -q 'patch secret trading-model-secrets.*MYSQL_MIGRATE_PASSWORD' "$STUB_LOG" && grep -q 'job/db-migrate ' "$STUB_LOG"; } && ok "key missing (staging): seeded, jobs run" || ko "seed"

STUB_KEY=c2VjcmV0 run bash "$RUN" ns user-only
{ [ $RC = 0 ] && grep -q 'job/db-migrate-user ' "$STUB_LOG" && ! grep -q 'job/db-migrate ' "$STUB_LOG"; } && ok "user-only: no migration job" || ko "user-only"

export SEALED_WAIT_TRIES=1
printf '#!/usr/bin/env bash
exit 0
' >"$WORK/bin/sleep"; chmod +x "$WORK/bin/sleep"
STUB_KEY= STUB_KEY_AFTER_APPLY=c2VjcmV0 SEALED_SECRETS_FILE=sealed.yaml run bash "$RUN" ns
{ [ $RC = 0 ] && grep -q '^apply .*sealed.yaml' "$STUB_LOG" && grep -q 'job/db-migrate-user ' "$STUB_LOG"; } && ok "key missing (production, existing cluster): SealedSecret applied first, jobs run" || ko "sealed apply"

STUB_KEY= SEALED_SECRETS_FILE=sealed.yaml run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'MYSQL_ROOT_PASSWORD' <<<"$OUT" && ! grep -q 'job/' "$STUB_LOG"; } && ok "key still missing after apply: error with command and root-password warning" || ko "sealed timeout"

printf '  encryptedData:
    MYSQL_MIGRATE_PASSWORD: x
' >"$WORK/single.yaml"
STUB_KEY= STUB_LIVE_KEYS="MYSQL_ROOT_PASSWORD SIGNING_SECRET" SEALED_SECRETS_FILE="$WORK/single.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'MYSQL_ROOT_PASSWORD' <<<"$OUT" && ! grep -q '^apply\|job/' "$STUB_LOG"; } && ok "single-key SealedSecret: refused before apply" || ko "single-key guard"

STUB_GET_ERR='Error from server (Forbidden): secrets is forbidden' SEALED_SECRETS_FILE="$WORK/single.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'cannot read Secret' <<<"$OUT" && ! grep -q '^apply\|job/' "$STUB_LOG"; } && ok "unreadable Secret: fatal, nothing applied" || ko "read error"

STUB_GET_ERR='Error from server (NotFound): secrets "trading-model-secrets" not found' SEED_MIGRATE_PASSWORD=true run bash "$RUN" ns
{ [ $RC = 0 ] && grep -q 'job/db-migrate ' "$STUB_LOG"; } && ok "Secret NotFound: treated as missing key" || ko "notfound"

exit $FAILED
