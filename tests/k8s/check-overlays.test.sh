#!/usr/bin/env bash
# tests/k8s/check-overlays.mjs on a copy whose staging-local SealedSecret holds a placeholder.  bash tests/k8s/check-overlays.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
cp -r "$ROOT/deploy" "$ROOT/scripts" "$ROOT/.github" "$TMP"
sed -i 's/^\(    SIGNING_SECRET: \).*/\1AgCHANGE_ME_RUN_KUBESEAL_Ag==/' "$TMP/deploy/k8s/overlays/staging-local/sealed-secrets.yaml"
if out="$(cd "$TMP" && node "$ROOT/tests/k8s/check-overlays.mjs" 2>&1)"; then
  echo "  ✗ staging-local placeholder accepted"; exit 1
fi
if grep -q '^staging-local: placeholder AgCHANGE_ME for SIGNING_SECRET:' <<<"$out"; then
  echo "  ✓ staging-local placeholder refused"
else
  echo "  ✗ unexpected failure:"; echo "$out"; exit 1
fi
