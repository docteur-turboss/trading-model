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
if [ "$1" = get ] && [ "$2" = secret ]; then printf '%s' "${STUB_KEY:-}"; exit 0; fi
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

exit $FAILED
