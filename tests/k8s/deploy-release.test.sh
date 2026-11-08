#!/usr/bin/env bash
# deploy/k8s/scripts/deploy-release.sh (issue #413): `render` pins every
# first-party image of the real overlays by digest (real kubectl kustomize);
# `record` and `rollback` against a stub kubectl. The cluster path (upgrade,
# failure, rollback on kind) is `tests/k8s/run-kind.sh upgrade`.
#   bash tests/k8s/deploy-release.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/deploy/k8s/scripts/deploy-release.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK" "$ROOT"/deploy/k8s/overlays/.deploy-staging "$ROOT"/deploy/k8s/overlays/.deploy-production' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }

IMAGES="discovery-server message-manager financial-scraper trader-trainer api-gateway audit-logger dlq-service spire-tools backup-tools"
for img in $IMAGES; do
	echo "$img sha256:$(printf '%s' "$img" | sha256sum | cut -d' ' -f1)"
done >"$WORK/digests"

for env in staging production; do
	rendered="$(bash "$SCRIPT" render "$ROOT/deploy/k8s/overlays/$env" registry.example/acme "$WORK/digests")"
	unpinned="$(grep -oE 'image: *"?[^ "]*trading-model/[^ "]*' <<<"$rendered" | grep -v '@sha256:' || true)"
	[ -z "$unpinned" ] && ok "$env: every first-party image pinned by digest" || ko "$env: not pinned: $unpinned"
	left="$(grep -cE 'image: *"?ghcr.io/trading-model/' <<<"$rendered" || true)"
	[ "$left" = 0 ] && ok "$env: images moved to the registry" || ko "$env: $left image(s) still on ghcr.io/trading-model"
	grep -q "registry.example/acme/api-gateway@$(awk '$1 == "api-gateway" {print $2}' "$WORK/digests")" <<<"$rendered" &&
		ok "$env: api-gateway at its digest" || ko "$env: api-gateway not at its digest"
done
: >"$WORK/empty"
bash "$SCRIPT" render "$ROOT/deploy/k8s/overlays/staging" r "$WORK/empty" >/dev/null 2>&1 &&
	ko "render accepted an empty digest file" || ok "render refuses an empty digest file"

mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# Revisions: $STUB_REVS "dep=rev" (absent: no Deployment). Undo of $STUB_UNDO_FAILS fails.
# Grace periods: $STUB_GRACE "dep=seconds" (absent: none in the template).
echo "$*" >>"$STUB_LOG"
if [ "$1" = get ] && [ "$2" = deployment ] && [[ $* == *terminationGracePeriodSeconds* ]]; then
	for pair in $STUB_GRACE; do [ "${pair%%=*}" = "$3" ] && printf '%s' "${pair#*=}"; done
	exit 0
fi
if [ "$1" = get ] && [ "$2" = statefulset ]; then [ "$3" = redis ] && printf 'redis-abc'; exit 0; fi
if [ "$1" = get ] && [ "$2" = controllerrevision ]; then [ "$3" = redis-abc ] && printf '3'; exit 0; fi
if [ "$1" = rollout ] && [ "$2" = status ]; then [ "$3" = "deployment/${STUB_STATUS_FAILS:-}" ] && exit 1; exit 0; fi
if [ "$1" = get ] && [ "$2" = deployment ]; then
	for pair in $STUB_REVS; do [ "${pair%%=*}" = "$3" ] && printf '%s' "${pair#*=}"; done
	exit 0
fi
if [ "$1" = rollout ] && [ "$2" = undo ]; then
	[ "$3" = "deployment/$STUB_UNDO_FAILS" ] && exit 1
	exit 0
fi
exit 2
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log"

STUB_REVS="discovery-server=4 api-gateway=7" bash "$SCRIPT" record ns "$WORK/revs" >/dev/null
grep -qx "discovery-server 4" "$WORK/revs" && grep -qx "api-gateway 7" "$WORK/revs" &&
	grep -qx "edge-proxy none" "$WORK/revs" && grep -qx "statefulset/redis 3" "$WORK/revs" && grep -qx "statefulset/redis-sentinel none" "$WORK/revs" &&
	[ "$(wc -l <"$WORK/revs")" -eq 11 ] &&
	ok "record writes the Redis StatefulSets and the 9 Deployments, none when missing" || ko "record: $(cat "$WORK/revs")"

printf 'discovery-server 4\napi-gateway 7\n' >"$WORK/revs"
: >"$WORK/log"
STUB_UNDO_FAILS="" bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	grep -q "rollout undo deployment/api-gateway -n ns --to-revision=7" "$WORK/log" &&
	ok "rollback undoes to the recorded revision" || ko "rollback: $(cat "$WORK/log")"

printf 'discovery-server 4\nedge-proxy none\napi-gateway 7\n' >"$WORK/revs"
: >"$WORK/log"
out="$(STUB_UNDO_FAILS=discovery-server bash "$SCRIPT" rollback ns "$WORK/revs" 2>&1)" &&
	ko "rollback succeeded with a failed undo and a new Deployment" ||
	{ grep -q "deployment/api-gateway" "$WORK/log" && [[ $out == *"edge-proxy: it did not exist"* ]] &&
		ok "rollback fails, reports and still tries every Deployment" || ko "rollback: $out"; }

printf 'discovery-server 4
api-gateway 7
' >"$WORK/revs"
: >"$WORK/log"
out="$(STUB_STATUS_FAILS=discovery-server bash "$SCRIPT" rollback ns "$WORK/revs" 2>&1)" &&
	ko "rollback succeeded though a rollout did not come back" ||
	{ grep -q "rollout status deployment/api-gateway -n ns --timeout=180s" "$WORK/log" &&
		[[ $out == *"discovery-server did not finish rolling back"* ]] &&
		ok "rollback waits for each rollout and fails if one does not come back" || ko "rollback status: $out"; }

printf 'statefulset/redis 3\nstatefulset/redis-sentinel 2\ndiscovery-server 4\n' >"$WORK/revs"
: >"$WORK/log"
bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	[ "$(grep -n 'rollout undo statefulset/redis-sentinel' "$WORK/log" | cut -d: -f1)" -lt \
		"$(grep -n 'rollout status statefulset/redis ' "$WORK/log" | cut -d: -f1)" ] &&
	ok "rollback undoes every resource before waiting (Redis and its sentinels restart together)" ||
	ko "rollback order: $(cat "$WORK/log")"

: >"$WORK/log"
STUB_GRACE="financial-scraper-collector=360 api-gateway=30" bash "$SCRIPT" wait ns >/dev/null &&
	grep -q "rollout status deployment/financial-scraper-collector -n ns --timeout=540s" "$WORK/log" &&
	grep -q "rollout status deployment/api-gateway -n ns --timeout=210s" "$WORK/log" &&
	grep -q "rollout status deployment/edge-proxy -n ns --timeout=210s" "$WORK/log" &&
	grep -q "rollout status statefulset/redis-sentinel -n ns --timeout=180s" "$WORK/log" &&
	ok "wait adds each template's termination grace to the timeout" || ko "wait: $(cat "$WORK/log")"
bash "$SCRIPT" wait ns 3m >/dev/null 2>&1 && ko "wait accepted a timeout not in seconds" || ok "wait refuses a timeout not in seconds"

: >"$WORK/log"
DEPLOY_TIMEOUT_FACTOR=4 STUB_GRACE="api-gateway=30" bash "$SCRIPT" wait ns >/dev/null &&
	grep -q "rollout status statefulset/redis -n ns --timeout=720s" "$WORK/log" &&
	grep -q "rollout status deployment/api-gateway -n ns --timeout=750s" "$WORK/log" &&
	ok "DEPLOY_TIMEOUT_FACTOR multiplies the wait, not the grace" || ko "factor: $(cat "$WORK/log")"
DEPLOY_TIMEOUT_FACTOR=x bash "$SCRIPT" wait ns >/dev/null 2>&1 && ko "bad DEPLOY_TIMEOUT_FACTOR accepted" ||
	ok "DEPLOY_TIMEOUT_FACTOR not a positive integer: refused"

bash "$SCRIPT" bogus >/dev/null 2>&1 && ko "unknown command accepted" || ok "unknown command refused"

exit "$FAILED"
