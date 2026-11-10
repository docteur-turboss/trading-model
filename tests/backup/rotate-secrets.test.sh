#!/usr/bin/env bash
# scripts/rotate-secrets.sh against stub kubectl, kubeseal and openssl: --component
# parsing, unknown / database components refused, DRY_RUN touches nothing, the
# consumers restarted per component, the new key merged into the SealedSecret file
# without losing the others, no value printed.
#   bash tests/backup/rotate-secrets.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/scripts/rotate-secrets.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
# shellcheck source=test-lib.sh
source "$ROOT/tests/backup/test-lib.sh"

mkdir -p "$WORK/bin" "$WORK/state"
# kubectl create secret prints "KEY=VALUE"; kubeseal merges it into the file as
# "    KEY: VALUE" (replacing the line); apply copies the file's lines to the live
# Secret (state/live_<KEY>, base64 like the API) when STUB_DECRYPT != 0.
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >>"$STUB_STATE/calls"
case " $* " in
*" create secret "*) for a in "$@"; do case "$a" in --from-literal=*) echo "${a#--from-literal=}" ;; esac; done ;;
*" apply "*)
	[ "${STUB_DECRYPT:-1}" = 1 ] || exit 0
	f="${*: -1}"
	while IFS=': ' read -r k v; do
		case "$k" in [A-Z]*) printf '%s' "$v" >"$STUB_STATE/live_$k" ;; esac
	done <"$f"
	;;
*" get secret "*) f="$STUB_STATE/live_$(sed -E 's/.*\{\.data\.([A-Z_]+)\}.*/\1/' <<<"$*")"; [ -f "$f" ] && cat "$f" || true ;;
esac
STUB
cat >"$WORK/bin/kubeseal" <<'STUB'
#!/usr/bin/env bash
echo "kubeseal $*" >>"$STUB_STATE/calls"
file=""
while [ $# -gt 0 ]; do [ "$1" = --merge-into ] && file="$2"; shift; done
IFS='=' read -r k v
grep -v "^    $k: " "$file" >"$file.new" || true
echo "    $k: $(printf '%s' "$v" | base64 | tr -d '\n')" >>"$file.new"
mv "$file.new" "$file"
STUB
cat >"$WORK/bin/openssl" <<'STUB'
#!/usr/bin/env bash
echo "SECRETVALUE$2"
STUB
chmod +x "$WORK/bin/"*
sleep() { :; }
export -f sleep
export PATH="$WORK/bin:$PATH" STUB_STATE="$WORK/state" WAIT_TRIES=2

run() { # <args...>: fresh state and sealed file; sets OUT and RC
	rm -rf "$WORK/state" && mkdir "$WORK/state"
	printf 'spec:\n  encryptedData:\n    MYSQL_ROOT_PASSWORD: b2xk\n    SIGNING_SECRET: b2xk\n' >"$WORK/sealed.yaml"
	RC=0
	OUT=$(SEALED_SECRETS_FILE="$WORK/sealed.yaml" bash "$SCRIPT" "$@" 2>&1) || RC=$?
}
calls() { cat "$WORK/state/calls" 2>/dev/null || true; }
restarts() { calls | sed -n 's|.*rollout restart deployment/\([a-z-]*\).*|\1|p' | sort | paste -sd ' ' -; }

run --component hmac
[ "$RC" = 1 ] && grep -q Usage <<<"$OUT" && pass "unknown component refused" || failed "unknown component: rc=$RC"
run hmac
[ "$RC" = 1 ] && pass "positional form refused" || failed "positional: rc=$RC"
run --component MYSQL_PASSWORD
[ "$RC" = 1 ] && grep -q sealed-secrets.md <<<"$OUT" && [ -z "$(calls)" ] && pass "database password refused with doc pointer" || failed "database component: rc=$RC"

DRY_RUN=true run --component all
[ "$RC" = 0 ] && [ -z "$(calls)" ] && pass "DRY_RUN calls nothing" || failed "DRY_RUN: rc=$RC calls=$(calls)"

run --component signing
[ "$RC" = 0 ] && [ "$(restarts)" = "discovery-server" ] && pass "signing restarts discovery-server" || failed "signing: rc=$RC restarts=$(restarts)"
grep -q "MYSQL_ROOT_PASSWORD: b2xk" "$WORK/sealed.yaml" && ! grep -q "SIGNING_SECRET: b2xk" "$WORK/sealed.yaml" && pass "merge keeps other keys, replaces the rotated one" || failed "merge result: $(cat "$WORK/sealed.yaml")"
! grep -q SECRETVALUE <<<"$OUT" && pass "no value printed" || failed "value printed"

run --component dlq
[ "$(restarts)" = "dlq-service message-manager" ] && grep -q "DLQ_AUTH_HMAC_SECRET:" "$WORK/sealed.yaml" && pass "dlq restarts message-manager and dlq-service" || failed "dlq: restarts=$(restarts)"

run --component tokens
[ "$(restarts)" = "api-gateway" ] && base64 -d <<<"$(sed -n 's/^    AUTH_TOKENS: //p' "$WORK/sealed.yaml")" | grep -q '^ops:read+dlq:write:SECRETVALUE' && pass "tokens: name:scopes:secret, api-gateway restarted" || failed "tokens: restarts=$(restarts)"

run
[ "$(restarts)" = "api-gateway discovery-server dlq-service message-manager" ] && pass "default rotates all" || failed "all: restarts=$(restarts)"

STUB_DECRYPT=0 run --component dlq
[ "$RC" = 1 ] && [ -z "$(restarts)" ] && pass "no restart when the controller did not decrypt" || failed "undecrypted: rc=$RC restarts=$(restarts)"

exit "$FAILED"
