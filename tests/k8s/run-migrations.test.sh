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
if [ "$1" = get ] && [[ "$2" == job/* ]]; then printf "Complete "; exit 0; fi # wait-job.sh: Job done
if [ "$1" = get ] && [ "$2" = secret ] && [ -n "${STUB_GET_ERR:-}" ]; then echo "$STUB_GET_ERR" >&2; exit 1; fi
# STUB_*_AFTER_APPLY: what the Secret holds once the SealedSecret was applied
applied() { grep -q '^apply .*sealed' "$STUB_LOG"; }
if [ "$1" = get ] && [ "$2" = secret ] && [[ "$*" == *go-template* ]]; then
  if [ -n "${STUB_LIVE_KEYS_AFTER_APPLY:-}" ] && applied; then printf '%s' "$STUB_LIVE_KEYS_AFTER_APPLY"; else printf '%s' "${STUB_LIVE_KEYS:-}"; fi
  exit 0
fi
if [ "$1" = get ] && [ "$2" = secret ]; then
  if [ -n "${STUB_KEY_AFTER_APPLY:-}" ] && applied; then printf '%s' "$STUB_KEY_AFTER_APPLY"; else printf '%s' "${STUB_KEY:-}"; fi
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
# A SealedSecret as committed: metadata, a comment and a template around the keys.
cat >"$WORK/sealed.yaml" <<'YAML'
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: trading-model-secrets
  labels:
    app.kubernetes.io/part-of: trading-model
spec:
  encryptedData:
    # sealed with kubeseal
    MYSQL_EXPORTER_PASSWORD: AgA=
    MYSQL_MIGRATE_PASSWORD: AgA=
    MYSQL_ROOT_PASSWORD: AgA=
  template:
    type: Opaque
YAML
ALL="MYSQL_EXPORTER_PASSWORD MYSQL_MIGRATE_PASSWORD MYSQL_ROOT_PASSWORD"
# Line of the first log entry matching $1 (0 when absent).
at() { grep -n -m1 "$1" "$STUB_LOG" | cut -d: -f1 || echo 0; }

STUB_KEY= STUB_KEY_AFTER_APPLY=c2VjcmV0 STUB_LIVE_KEYS=MYSQL_ROOT_PASSWORD STUB_LIVE_KEYS_AFTER_APPLY="$ALL" SEALED_SECRETS_FILE="$WORK/sealed.yaml" run bash "$RUN" ns
{ [ $RC = 0 ] && grep -q '^apply .*sealed.yaml' "$STUB_LOG" && grep -q 'job/db-migrate-user ' "$STUB_LOG"; } && ok "key missing (production, existing cluster): SealedSecret applied first, jobs run" || ko "sealed apply"

# Issue #698: MYSQL_MIGRATE_PASSWORD is there, MYSQL_EXPORTER_PASSWORD is new.
STUB_KEY=c2VjcmV0 STUB_LIVE_KEYS="MYSQL_MIGRATE_PASSWORD MYSQL_ROOT_PASSWORD" STUB_LIVE_KEYS_AFTER_APPLY="$ALL" SEALED_SECRETS_FILE="$WORK/sealed.yaml" run bash "$RUN" ns
APPLY=$(at '^apply .*sealed.yaml') USER_JOB=$(at 'job db-migrate-user')
WAITED=$(tail -n +"$((APPLY + 1))" "$STUB_LOG" | head -n "$((USER_JOB - APPLY - 1))" | grep -c go-template || true)
{ [ $RC = 0 ] && [ "$APPLY" -gt 0 ] && [ "$APPLY" -lt "$USER_JOB" ] && [ "$WAITED" -gt 0 ] && grep -q 'lacks MYSQL_EXPORTER_PASSWORD' <<<"$OUT"; } &&
  ok "new key (exporter) with the migrate key present: SealedSecret applied and waited for before db-migrate-user" || ko "new key: apply=$APPLY user-job=$USER_JOB waited=$WAITED"

STUB_KEY=c2VjcmV0 STUB_LIVE_KEYS="$ALL" SEALED_SECRETS_FILE="$WORK/sealed.yaml" run bash "$RUN" ns
{ [ $RC = 0 ] && ! grep -q '^apply .*sealed' "$STUB_LOG" && grep -q 'job/db-migrate ' "$STUB_LOG"; } && ok "no new key: SealedSecret left to the overlay, jobs run" || ko "no new key"

STUB_KEY= STUB_LIVE_KEYS=MYSQL_ROOT_PASSWORD SEALED_SECRETS_FILE="$WORK/sealed.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'MYSQL_EXPORTER_PASSWORD MYSQL_MIGRATE_PASSWORD still missing' <<<"$OUT" && ! grep -q 'job/\|job db-' "$STUB_LOG"; } && ok "keys never decrypted: explicit error, no Job" || ko "sealed timeout"

STUB_KEY=c2VjcmV0 SEALED_SECRETS_FILE="$WORK/missing.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && ! grep -q '^apply\|job db-' "$STUB_LOG"; } && ok "SealedSecret file not found: fatal, nothing applied" || ko "missing file"

printf '  encryptedData:
    MYSQL_MIGRATE_PASSWORD: x
' >"$WORK/single.yaml"
STUB_KEY= STUB_LIVE_KEYS="MYSQL_ROOT_PASSWORD SIGNING_SECRET" SEALED_SECRETS_FILE="$WORK/single.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'MYSQL_ROOT_PASSWORD' <<<"$OUT" && ! grep -q '^apply\|job/' "$STUB_LOG"; } && ok "single-key SealedSecret: refused before apply" || ko "single-key guard"

STUB_KEY=c2VjcmV0 STUB_LIVE_KEYS="MYSQL_MIGRATE_PASSWORD SIGNING_SECRET" SEALED_SECRETS_FILE="$WORK/single.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'no entry for live key SIGNING_SECRET' <<<"$OUT" && ! grep -q '^apply\|job db-' "$STUB_LOG"; } && ok "live key missing from the file, migrate key present: refused before apply" || ko "guard with migrate key present"

STUB_GET_ERR='Error from server (Forbidden): secrets is forbidden' SEALED_SECRETS_FILE="$WORK/single.yaml" run bash "$RUN" ns
{ [ $RC = 1 ] && grep -q 'cannot read Secret' <<<"$OUT" && ! grep -q '^apply\|job/' "$STUB_LOG"; } && ok "unreadable Secret: fatal, nothing applied" || ko "read error"

STUB_GET_ERR='Error from server (NotFound): secrets "trading-model-secrets" not found' SEED_MIGRATE_PASSWORD=true run bash "$RUN" ns
{ [ $RC = 0 ] && grep -q 'job/db-migrate ' "$STUB_LOG"; } && ok "Secret NotFound: treated as missing key" || ko "notfound"

exit $FAILED
