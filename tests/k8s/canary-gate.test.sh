#!/usr/bin/env bash
# Canary gate of deploy-k8s.sh (issue #421), off any cluster: a stub `kubectl`
# serves a primary Deployment, ready endpoints and per-service /metrics, and logs
# every call. Checks `canary-all` (parallel canaries, one observation window):
# a readiness-only service without traffic passes, a service without traffic or
# with errors fails, and a failure removes every canary. Needs jq.
#   bash tests/k8s/canary-gate.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY="$ROOT/deploy/k8s/scripts/deploy-k8s.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0

pass() { echo "  ✓ $*"; }
failed() {
	echo "  ✗ $*"
	FAILED=1
}

mkdir -p "$WORK/bin" "$WORK/metrics"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# Stub kubectl: logs "<verb> <resource>" lines; /metrics come from $STUB_DIR/metrics/<service>.
echo "$*" >>"$STUB_DIR/kubectl.log"
svc_of() { sed -E 's/.*(api-gateway|dlq-service|audit-logger).*/\1/' <<<"$*"; }
case "$*" in
*"cluster-info"*) ;;
*"get deployment"*"-o jsonpath"*) echo 2 ;;
*"get deployment"*"-o json"*)
	s="$(svc_of "$*")"
	echo "{\"metadata\":{\"name\":\"$s\"},\"spec\":{\"replicas\":2,\"selector\":{\"matchLabels\":{}},\"template\":{\"metadata\":{\"labels\":{}},\"spec\":{\"containers\":[{\"name\":\"$s\",\"image\":\"old\"}]}}}}"
	;;
*"get endpointslices"*)
	s="$(sed -E 's/.*service-name=([a-z-]+).*/\1/' <<<"$*")"
	echo "{\"items\":[{\"endpoints\":[{\"targetRef\":{\"name\":\"$s-canary-abc\"}},{\"targetRef\":{\"name\":\"$s-old\"}}]}]}"
	;;
*"get pods"*) s="$(sed -E 's/.*component=([a-z-]+),.*/\1/' <<<"$*")"; echo "pod/$s-canary-abc" ;;
*"exec -n"*)
	s="$(sed -E 's/.*-c ([a-z-]+) .*/\1/' <<<"$*")"
	[ -f "$STUB_DIR/metrics/$s" ] && cat "$STUB_DIR/metrics/$s" || exit 1
	;;
*"apply"*) cat >/dev/null ;;
esac
STUB
# jq.exe (Git Bash on Windows) ends lines with CRLF: strip it so the script's `read` works.
JQ="$(command -v jq)"
cat >"$WORK/bin/jq" <<WRAP
#!/usr/bin/env bash
"$JQ" "\$@" | sed "s/[[:cntrl:]]\$//"
WRAP
chmod +x "$WORK/bin/kubectl" "$WORK/bin/jq"
export PATH="$WORK/bin:$PATH" STUB_DIR="$WORK" CANARY_GATE_SECONDS=0 CANARY_MIN_REQUESTS=20 CANARY_READINESS_ONLY=dlq-service

metrics() { # <service> <ok requests> <5xx requests>
	printf 'http_requests_total{path="/v1/x",status="200"} %s\nhttp_requests_total{path="/v1/x",status="500"} %s\nhttp_requests_total{path="/health/ready",status="200"} 999\n' "$2" "$3" >"$WORK/metrics/$1"
}
run() { : >"$WORK/kubectl.log"; bash "$DEPLOY" canary-all "" 10 api-gateway dlq-service audit-logger >"$WORK/out" 2>&1; }
deleted_all() { for s in api-gateway dlq-service audit-logger; do grep -q "delete deployment.* $s-canary" "$WORK/kubectl.log" || return 1; done; }

echo "healthy services + readiness-only dlq-service without traffic"
metrics api-gateway 100 1; metrics audit-logger 50 0; rm -f "$WORK/metrics/dlq-service"
if run; then pass "gate passes"; else failed "gate should pass"; cat "$WORK/out"; fi
grep -q "readiness-only" "$WORK/out" && pass "dlq-service logged as readiness-only" || failed "no readiness-only log"
[ "$(grep -c "scale deployment" "$WORK/kubectl.log")" -eq 3 ] && pass "3 canaries scaled to 0" || failed "canaries not scaled down"

echo "service without traffic"
metrics api-gateway 100 0; metrics audit-logger 3 0
if run; then failed "no-signal service should fail"; else pass "gate fails"; fi
grep -q "audit-logger-canary saw 3 requests" "$WORK/out" && pass "names the starved service" || failed "wrong message"
# the failed canary is deleted by the abort and every other one by the cleanup
deleted_all && pass "every canary removed" || failed "canary left behind"

echo "service in error"
metrics audit-logger 50 0; metrics api-gateway 10 90
if run; then failed "error-rate service should fail"; else pass "gate fails"; fi
grep -q "api-gateway-canary error rate 90%" "$WORK/out" && pass "reports the error rate" || failed "wrong message"
deleted_all && pass "every canary removed" || failed "canary left behind"

exit "$FAILED"
