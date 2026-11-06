#!/usr/bin/env bash
# deploy/k8s/scripts/notify-slack.sh (issue #435) with a stub curl:
# started / succeeded / failed / rolled-back, no webhook, failed delivery, hostile version.
#   bash tests/k8s/notify-slack.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/deploy/k8s/scripts/notify-slack.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }
mkdir -p "$WORK/bin"
cat >"$WORK/bin/curl" <<'STUB'
#!/usr/bin/env bash
# Records every argument on its own line; exit code from $STUB_CURL_RC.
printf '%s\n' "$@" >>"$STUB_LOG"
exit "${STUB_CURL_RC:-0}"
STUB
chmod +x "$WORK/bin/curl"

run() { # run <event> [version]; env: SLACK, STUB_CURL_RC
  : >"$WORK/log"
  PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log" EVENT="$1" DEPLOY_ENV=staging \
    VERSION="${2:-1.2.3}" SHA=abc123 RUN_URL=https://x/runs/1 bash "$SCRIPT" 2>&1
}
export SLACK=https://hooks.example/SECRET

for pair in "started:Deploy started:" "succeeded:Deploy succeeded:" "failed:Deploy FAILED: staging" "rolled-back:Deploy FAILED, rolled back:"; do
  ev="${pair%%:*}"; want="${pair#*:}"
  out="$(run "$ev")"
  if grep -qF "$want" "$WORK/log" && [ "$(grep -c '^https://hooks.example/SECRET$' "$WORK/log")" = 1 ] && [ -z "$out" ]; then ok "$ev"; else ko "$ev: $out"; fi
done

out="$(run succeeded '1"},{"x":"$(id)')"
body="$(grep -m1 "^{" "$WORK/log" || true)"
if echo "$body" | jq -e '.text|contains("$(id)")' >/dev/null; then ok "hostile version stays valid JSON"; else ko "hostile version: $body"; fi

out="$(STUB_CURL_RC=22 run failed)"
case "$out" in *"::warning::Deploy event not delivered"*) ok "delivery failure warns" ;; *) ko "no warning: $out" ;; esac
case "$out" in *SECRET*) ko "webhook leaked" ;; *) ok "webhook not in output" ;; esac

out="$(SLACK= run started)"
if [ ! -s "$WORK/log" ] && [[ "$out" == *"::notice::"* ]]; then ok "no webhook: skipped"; else ko "no webhook: $out"; fi

exit "$FAILED"
