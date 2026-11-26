#!/usr/bin/env bash
# tests/k8s/check-overlays.mjs on a copy whose staging-local SealedSecret holds a placeholder.  bash tests/k8s/check-overlays.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/deploy" "$ROOT/scripts" "$ROOT/.github" "$ROOT/docker-compose.yml" "$TMP"
mkdir -p "$TMP/services/api-gateway/src/shared" && cp "$ROOT/services/api-gateway/src/shared/public-routes.ts" "$TMP/services/api-gateway/src/shared/"
# The base kustomization builds the ConfigMap financial-scraper-signal-registry from this file (issue #1308).
mkdir -p "$TMP/services/financial-scraper/src/config"
cp "$ROOT/services/financial-scraper/src/config/signal-registry.json" "$TMP/services/financial-scraper/src/config/"
sed -i 's/^\(    MYSQL_PASSWORD: \).*/\1AgCHANGE_ME_RUN_KUBESEAL_Ag==/' "$TMP/deploy/k8s/overlays/staging-local/sealed-secrets.yaml"
if out="$(cd "$TMP" && node "$ROOT/tests/k8s/check-overlays.mjs" 2>&1)"; then
  echo "  ✗ staging-local placeholder accepted"; exit 1
fi
if grep -q '^staging-local: placeholder AgCHANGE_ME for MYSQL_PASSWORD:' <<<"$out"; then
  echo "  ✓ staging-local placeholder refused"
else
  echo "  ✗ unexpected failure:"; echo "$out"; exit 1
fi
# Issue #1456: a bare-named configMap volume on a database StatefulSet, even one ending in 10 letters.
cp -r "$ROOT/deploy" "$TMP/bare"
sed -i 's/^            name: mysql-config$/            name: mysql-entrypoint/' "$TMP/bare/k8s/infra/mysql.yaml"
rm -r "$TMP/deploy" && mv "$TMP/bare" "$TMP/deploy"
if out="$(cd "$TMP" && node "$ROOT/tests/k8s/check-overlays.mjs" 2>&1)"; then
  echo "  ✗ bare ConfigMap mysql-entrypoint accepted"; exit 1
fi
if grep -q '^staging: StatefulSet mysql mounts ConfigMap mysql-entrypoint by a bare name' <<<"$out"; then
  echo "  ✓ bare ConfigMap refused"
else
  echo "  ✗ unexpected failure:"; echo "$out"; exit 1
fi
# Issue #1685: a spire-agent newer than the spire-server it talks to.
rm -r "$TMP/deploy" && cp -r "$ROOT/deploy" "$TMP/deploy"
sed -i 's#spire-agent:1\.[0-9]*\.[0-9]*@#spire-agent:9.0.0@#' "$TMP/deploy/k8s/node-agents/spire-agent.yaml"
if out="$(cd "$TMP" && node "$ROOT/tests/k8s/check-overlays.mjs" 2>&1)"; then
  echo "  ✗ newer spire-agent accepted"; exit 1
fi
if grep -q '^staging: spire-agent 9.0 is newer than spire-server' <<<"$out"; then
  echo "  ✓ newer spire-agent refused"
else
  echo "  ✗ unexpected failure:"; echo "$out"; exit 1
fi
# ADR-0064 §6 (issue #1695): EXECUTION_MODE=live in a base shared with staging.
rm -r "$TMP/deploy" && cp -r "$ROOT/deploy" "$TMP/deploy"
sed -i 's/^EXECUTION_MODE=paper$/EXECUTION_MODE=live/' "$TMP/deploy/k8s/config/risk-execution.properties"
if out="$(cd "$TMP" && node "$ROOT/tests/k8s/check-overlays.mjs" 2>&1)"; then
  echo "  ✗ live outside production accepted"; exit 1
fi
if grep -q '^staging: risk-execution-config sets EXECUTION_MODE=live outside production' <<<"$out"; then
  echo "  ✓ live outside production refused"
else
  echo "  ✗ unexpected failure:"; echo "$out"; exit 1
fi
