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

IMAGES="financial-scraper trader-trainer api-gateway audit-logger model-evaluator risk-execution decision-consumer spire-tools backup-tools"
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
ruled="$(bash "$SCRIPT" render "$ROOT/deploy/k8s/overlays/staging" r "$WORK/digests" 1.2.3)"
grep -q 'runbook_url: .*/blob/v1.2.3/' <<<"$ruled" && ! grep -q 'runbook_url: .*/blob/main/' <<<"$ruled" &&
	ok "tag 1.2.3: runbook_url on blob/v1.2.3/" || ko "runbook_url not rewritten to the tag"
grep -q 'runbook_url: .*/blob/main/' <<<"$(bash "$SCRIPT" render "$ROOT/deploy/k8s/overlays/staging" r "$WORK/digests" latest)" &&
	ok "tag latest: runbook_url stays on main" || ko "runbook_url moved without a release tag"
: >"$WORK/empty"
bash "$SCRIPT" render "$ROOT/deploy/k8s/overlays/staging" r "$WORK/empty" >/dev/null 2>&1 &&
	ko "render accepted an empty digest file" || ok "render refuses an empty digest file"

bash "$SCRIPT" render "$ROOT/deploy/k8s/overlays/staging" r "$WORK/digests" >"$WORK/render.yaml"
mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# Revisions: $STUB_REVS "dep=rev" (absent: no Deployment). Undo of $STUB_UNDO_FAILS fails.
# Grace periods: $STUB_GRACE "dep=seconds" (absent: none in the template).
echo "$*" >>"$STUB_LOG"
# Rollback prune (issue #3021): the render holds networkpolicy/keep, the live ones are $STUB_NETPOL.
[[ $* == *--dry-run=client* ]] && { cat >/dev/null; echo networkpolicy/keep; exit 0; }
[ "$1" = get ] && [ "$2" = networkpolicies ] && { printf 'networkpolicy/%s
' $STUB_NETPOL; exit 0; }
# API server down: `get deployments` fails while the count in $STUB_API_DOWN is above 0.
if [ "$2" = deployments ] && [ -n "${STUB_API_DOWN:-}" ] && [ "$(cat "$STUB_API_DOWN")" -gt 0 ]; then
	echo $(($(cat "$STUB_API_DOWN") - 1)) >"$STUB_API_DOWN"
	exit 1
fi
if [ "$1" = get ] && [ "$2" = deployment ] && [[ $* == *terminationGracePeriodSeconds* ]]; then
	for pair in $STUB_GRACE; do [ "${pair%%=*}" = "$3" ] && printf '%s' "${pair#*=}"; done
	exit 0
fi
if [ "$1" = get ] && [ "$2" = pods ]; then printf "%b" "${STUB_PODS:-}"; exit 0; fi
if [ "$1" = get ] && [[ $2 == statefulset/* ]]; then [[ $* == *updateRevision* ]] && printf '%s-abc' "${2#*/}"; exit 0; fi
# Redis swap (issue #2882): "$STUB_REDIS" = partition replicas updateRevision; pods run revision `old`.
if [ "$1" = get ] && [ "$2" = statefulset ] && [[ $* == *partition* ]]; then printf '%s' "${STUB_REDIS:-}"; exit 0; fi
if [ "$1" = get ] && [ "$2" = pod ]; then [[ $* == *podIP* ]] && printf 'ip-%s' "$3" || printf old; exit 0; fi
# Sentinel in $STUB_MASTER: FAILOVER promotes the other pod, unless $STUB_NO_PROMOTE. CLIENT PAUSE
# answers $STUB_PAUSE, the first one $STUB_PAUSE_FIRST when set.
if [ "$1" = exec ] && [ -n "${STUB_MASTER:-}" ]; then
	case "$*" in
	*get-master-addr-by-name*) cat "$STUB_MASTER" ;;
	*"SENTINEL replicas"*) printf 'ip\nip-redis-0\nip\nip-redis-1\n' ;;
	*"INFO replication"*) printf 'master_link_status:up\r\nmaster_repl_offset:7\r\n' ;;
	*"CLIENT PAUSE"*)
		if [ -n "${STUB_PAUSE_FIRST:-}" ] && [ ! -e "$STUB_LOG.paused" ]; then
			: >"$STUB_LOG.paused"
			echo "$STUB_PAUSE_FIRST"
		else echo "${STUB_PAUSE:-OK}"; fi
		;;
	*"SENTINEL FAILOVER"*) [ -n "${STUB_NO_PROMOTE:-}" ] || { [ "$(cat "$STUB_MASTER")" = ip-redis-0 ] && echo ip-redis-1 >"$STUB_MASTER" || echo ip-redis-0 >"$STUB_MASTER"; } ;;
	esac
	exit 0
fi
# Swap marker (annotation trading-model/redis-swap) in the file $STUB_SWAP.
if [ "$1" = get ] && [[ $* == *redis-swap* ]]; then cat "${STUB_SWAP:-/dev/null}"; exit 0; fi
if [ "$1" = patch ]; then
	[[ $* == *'redis-swap":"1"'* ]] && echo 1 >"$STUB_SWAP"
	[[ $* == *'redis-swap":null'* ]] && : >"$STUB_SWAP"
	exit 0
fi
if [ "$1" = get ] && [ "$2" = statefulset ]; then [ -z "${STUB_NO_REDIS:-}" ] || exit 1; [ "$3" = redis ] && printf 'redis-abc'; exit 0; fi
[ "$1" = exec ] && [ -n "${STUB_IDS:-}" ] && { printf '%b' "$STUB_IDS"; exit 0; }
[ "$1" = exec ] && exit 0
if [ "$1" = create ] && [ "$2" = job ]; then cat "$STUB_JOB_JSON"; exit 0; fi
if [ "$1" = get ] && [[ $2 == job/* ]]; then printf '%s ' "${STUB_JOB_STATE:-Complete}"; exit 0; fi
[ "$1" = wait ] && [ -n "${STUB_WAIT_FAILS:-}" ] && exit 1
if [ "$1" = wait ] || [ "$1" = delete ] || [ "$1" = create ] || [ "$2" = configmap ] || [ "$2" = secret ] || [ "$2" = deployments ]; then exit 0; fi
if [ "$1" = get ] && [ "$2" = controllerrevision ]; then [ "$3" = redis-abc ] && printf '3'; exit 0; fi
if [ "$1" = rollout ] && [ "$2" = status ]; then [ "$3" = "deployment/${STUB_STATUS_FAILS:-}" ] || [ "$3" = "statefulset/${STUB_STATUS_FAILS:-}" ] && exit 1; exit 0; fi
if [ "$1" = get ] && [ "$2" = deployment ]; then
	for pair in $STUB_REVS; do [ "${pair%%=*}" = "$3" ] && printf '%s' "${pair#*=}"; done
	exit 0
fi
if [ "$1" = rollout ] && [ "$2" = undo ]; then
	[ "$3" = "deployment/$STUB_UNDO_FAILS" ] && exit 1
	exit 0
fi
[ "$1" = delete ] && exit 0
if [ "$1" = apply ]; then cat >>"$STUB_APPLIED"; exit 0; fi
[ "$1" = wait ] && exit 0
exit 2
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log" STUB_APPLIED="$WORK/applied"
log_line() { grep -n "$1" "$WORK/log" | tail -1 | cut -d: -f1; }

STUB_REVS="trader-trainer=4 api-gateway=7" bash "$SCRIPT" record ns "$WORK/revs" >/dev/null
grep -qx "trader-trainer 4" "$WORK/revs" && grep -qx "api-gateway 7" "$WORK/revs" &&
	grep -qx "edge-proxy none" "$WORK/revs" && grep -qx "statefulset/redis 3" "$WORK/revs" && grep -qx "statefulset/redis-sentinel none" "$WORK/revs" &&
	[ "$(wc -l <"$WORK/revs")" -eq 11 ] &&
	ok "record writes the Redis StatefulSets and the 9 Deployments, none when missing" || ko "record: $(cat "$WORK/revs")"

printf 'trader-trainer 4\napi-gateway 7\n' >"$WORK/revs"
: >"$WORK/log"
STUB_UNDO_FAILS="" bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	grep -q "rollout undo deployment/api-gateway -n ns --to-revision=7" "$WORK/log" &&
	ok "rollback undoes to the recorded revision" || ko "rollback: $(cat "$WORK/log")"

printf '#!/bin/sh\necho "sleep $*" >>"$STUB_LOG"\n' >"$WORK/bin/sleep"
chmod +x "$WORK/bin/sleep"

echo 2 >"$WORK/api-down"
: >"$WORK/log"
STUB_API_DOWN="$WORK/api-down" bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null 2>&1 &&
	[ "$(grep -c '^sleep 10$' "$WORK/log")" -eq 2 ] && grep -q "rollout undo deployment/api-gateway -n ns --to-revision=7" "$WORK/log" &&
	ok "rollback waits for the API server, then rolls back" || ko "rollback API wait: $(cat "$WORK/log")"
echo 1000 >"$WORK/api-down"
: >"$WORK/log"
out="$(STUB_API_DOWN="$WORK/api-down" bash "$SCRIPT" rollback ns "$WORK/revs" 2>&1)" &&
	ko "rollback succeeded with the API server down" ||
	{ [[ $out == *"API server unreachable for 300 s"* ]] && ! grep -q "rollout undo\|delete configmap" "$WORK/log" &&
		ok "rollback gives up after 300 s of API server down, nothing undone, ConfigMap kept" || ko "rollback API down: $out"; }
rm "$WORK/bin/sleep"

printf 'trader-trainer 4\nedge-proxy none\napi-gateway 7\n' >"$WORK/revs"
: >"$WORK/log"
out="$(STUB_UNDO_FAILS=trader-trainer bash "$SCRIPT" rollback ns "$WORK/revs" 2>&1)" &&
	ko "rollback succeeded with a failed undo and a new Deployment" ||
	{ grep -q "deployment/api-gateway" "$WORK/log" && grep -q "delete deployment/edge-proxy -n ns" "$WORK/log" &&
		ok "rollback fails on a failed undo, deletes a new Deployment, still tries every Deployment" || ko "rollback: $out"; }

printf 'trader-trainer 4
api-gateway 7
' >"$WORK/revs"
: >"$WORK/log"
out="$(STUB_STATUS_FAILS=trader-trainer bash "$SCRIPT" rollback ns "$WORK/revs" 2>&1)" &&
	ko "rollback succeeded though a rollout did not come back" ||
	{ grep -q "rollout status deployment/api-gateway -n ns --timeout=180s" "$WORK/log" &&
		[[ $out == *"trader-trainer did not finish rolling back"* ]] &&
		grep -q "describe deployment/trader-trainer -n ns" "$WORK/log" &&
		ok "rollback waits for each rollout and fails if one does not come back" || ko "rollback status: $out"; }

printf 'statefulset/redis 3\nstatefulset/redis-sentinel 2\ntrader-trainer 4\n' >"$WORK/revs"
: >"$WORK/log"
bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	[ "$(grep -n 'rollout undo statefulset/redis-sentinel' "$WORK/log" | cut -d: -f1)" -lt \
		"$(grep -n 'rollout status statefulset/redis ' "$WORK/log" | cut -d: -f1)" ] &&
	ok "rollback undoes every resource before waiting (Redis and its sentinels restart together)" ||
	ko "rollback order: $(cat "$WORK/log")"

printf 'statefulset/redis 3\n' >"$WORK/revs"
: >"$WORK/log"
STUB_PODS='redis-0 redis-abc False\nredis-1 redis-new True\nredis-2 redis-new False\nredis-3 redis-new\n' bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	grep -qx "delete pod redis-2 redis-3 -n ns" "$WORK/log" &&
	[ "$(grep -n 'delete pod' "$WORK/log" | cut -d: -f1)" -lt "$(grep -n 'rollout status statefulset/redis ' "$WORK/log" | cut -d: -f1)" ] &&
	ok "rollback deletes the not-ready pods of the failed revision only, before waiting" || ko "stuck pods: $(cat "$WORK/log")"

: >"$WORK/log"
STUB_GRACE="financial-scraper-collector=360 api-gateway=30" bash "$SCRIPT" wait ns >/dev/null &&
	grep -q "rollout status deployment/financial-scraper-collector -n ns --timeout=540s" "$WORK/log" &&
	grep -q "rollout status deployment/api-gateway -n ns --timeout=210s" "$WORK/log" &&
	grep -q "rollout status deployment/edge-proxy -n ns --timeout=210s" "$WORK/log" &&
	grep -q "rollout status statefulset/redis-sentinel -n ns --timeout=180s" "$WORK/log" &&
	ok "wait adds each template's termination grace to the timeout" || ko "wait: $(cat "$WORK/log")"
bash "$SCRIPT" wait ns 3m >/dev/null 2>&1 && ko "wait accepted a timeout not in seconds" || ok "wait refuses a timeout not in seconds"
for failing in deployment/api-gateway statefulset/redis; do
	: >"$WORK/log"
	out="$(STUB_STATUS_FAILS="${failing#*/}" STUB_PODS='api-1 0/1 CrashLoopBackOff 0 1m\njob-1 0/1 Completed 0 1m\n' bash "$SCRIPT" wait ns 2>&1)" &&
		ko "wait succeeded though $failing did not roll out" ||
		{ grep -q "describe $failing -n ns" "$WORK/log" && grep -q "logs api-1 -n ns" "$WORK/log" &&
			! grep -q "logs job-1" "$WORK/log" && [[ $out == *"Rollout of ${failing#*/} failed"* ]] &&
			ok "wait diagnoses $failing (describe, logs of non-ready pods, Completed skipped)" || ko "wait $failing: $out"; }
done

: >"$WORK/log"
DEPLOY_TIMEOUT_FACTOR=4 STUB_GRACE="api-gateway=30" bash "$SCRIPT" wait ns >/dev/null &&
	grep -q "rollout status statefulset/redis -n ns --timeout=720s" "$WORK/log" &&
	grep -q "rollout status deployment/api-gateway -n ns --timeout=750s" "$WORK/log" &&
	ok "DEPLOY_TIMEOUT_FACTOR multiplies the wait, not the grace" || ko "factor: $(cat "$WORK/log")"
DEPLOY_TIMEOUT_FACTOR=x bash "$SCRIPT" wait ns >/dev/null 2>&1 && ko "bad DEPLOY_TIMEOUT_FACTOR accepted" ||
	ok "DEPLOY_TIMEOUT_FACTOR not a positive integer: refused"

# The release steps of deploy.yml: overlay without Redis, Deployment rollouts, then Redis (issue #1156).
bash "$ROOT/scripts/split-cluster-scope.sh" app <"$WORK/render.yaml" >"$WORK/app.yaml"
: >"$WORK/log"
bash "$SCRIPT" without-redis ns <"$WORK/app.yaml" >"$WORK/overlay.yaml"
bash "$SCRIPT" wait ns >/dev/null && bash "$SCRIPT" redis-last ns <"$WORK/app.yaml" >/dev/null || ko "wait / redis-last failed"
sts_names() { awk '/^---/ { k = "" } /^kind:/ { k = $2 } k == "StatefulSet" && /^  name:/ { printf " %s", $2 }' "$1"; }
{ grep -q 'kind: Deployment' "$WORK/overlay.yaml" && grep -A5 '^kind: Certificate$' "$WORK/overlay.yaml" | grep -q '^  name: redis-tls$' &&
	[[ "$(sts_names "$WORK/overlay.yaml") " == *" mysql "* && "$(sts_names "$WORK/overlay.yaml") " != *" redis"* ]] &&
	[ "$(sts_names "$WORK/applied")" = " redis redis-sentinel" ] && ! grep -q 'kind: Deployment' "$WORK/applied" &&
	[ "$(log_line 'rollout status deployment/edge-proxy')" -lt "$(log_line 'wait --for=condition=Ready certificate/redis-tls')" ] &&
	[ "$(log_line 'wait --for=condition=Ready certificate/redis-tls')" -lt "$(log_line 'apply -f -')" ] &&
	[ "$(log_line 'apply -f -')" -lt "$(log_line 'rollout status statefulset/redis ')" ]; } &&
	ok "Redis StatefulSets left out of the overlay, applied after the Deployment rollouts and redis-tls, then waited for" ||
	ko "redis last: $(cat "$WORK/log")"
printf '#!/bin/sh\n' >"$WORK/bin/sleep"
chmod +x "$WORK/bin/sleep"
echo ip-redis-0 >"$WORK/master"
: >"$WORK/log"
export STUB_SWAP="$WORK/swap"
: >"$STUB_SWAP"
held="CLIENT PAUSE SENTINEL FAILOVER REPLICAOF CLIENT UNPAUSE"
STUB_MASTER="$WORK/master" STUB_REDIS="1 1 new" bash "$SCRIPT" redis-last ns <"$WORK/app.yaml" >/dev/null &&
	[ "$(grep -oE '"replicas":[0-9]|"partition":[0-9]|SENTINEL FAILOVER|CLIENT [A-Z]+|REPLICAOF' "$WORK/log" | tr '\n' ' ')" = "\"replicas\":2 $held \"partition\":0 $held \"replicas\":1 \"partition\":1 " ] &&
	[ "$(cat "$WORK/master")" = ip-redis-0 ] &&
	[ ! -s "$STUB_SWAP" ] && grep -q "SENTINEL RESET mymaster" "$WORK/log" &&
	ok "partitioned redis-0 on an older template: writes held over each failover, redis-0 updated and master again, back to 1 pod" || ko "redis swap: $(cat "$WORK/log")"
: >"$WORK/log"
STUB_MASTER="$WORK/master" STUB_REDIS="1 1 old" bash "$SCRIPT" redis-last ns <"$WORK/app.yaml" >/dev/null && ! grep -q patch "$WORK/log" &&
	ok "partitioned redis-0 already on the current template: no swap" || ko "redis no swap: $(cat "$WORK/log")"
# Rollback of a run stopped inside the swap, master on redis-1: redis-0 master and one pod before the undo.
echo ip-redis-1 >"$WORK/master"
echo 1 >"$STUB_SWAP"
printf 'statefulset/redis 3\n' >"$WORK/revs"
: >"$WORK/log"
STUB_PAUSE=NOPERM STUB_MASTER="$WORK/master" bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	[ "$(cat "$WORK/master")" = ip-redis-0 ] && [ ! -s "$STUB_SWAP" ] && ! grep -qE 'REPLICAOF|UNPAUSE' "$WORK/log" &&
	[ "$(log_line '"replicas":1')" -lt "$(log_line 'rollout undo statefulset/redis ')" ] &&
	ok "rollback inside a swap: redis-0 master again (old master unable to pause: plain failover), back to 1 pod before the Redis undo" || ko "rollback swap: $(cat "$WORK/log")"
# A pause failing for another reason than NOPERM: no unpaused failover, the next pass pauses.
echo ip-redis-1 >"$WORK/master"
echo 1 >"$STUB_SWAP"
: >"$WORK/log"
STUB_PAUSE_FIRST="error: Timeout occurred" STUB_MASTER="$WORK/master" bash "$SCRIPT" rollback ns "$WORK/revs" >/dev/null &&
	[ "$(grep -oE 'SENTINEL FAILOVER|CLIENT [A-Z]+|REPLICAOF' "$WORK/log" | tr '
' ' ')" = "CLIENT PAUSE CLIENT PAUSE SENTINEL FAILOVER REPLICAOF CLIENT UNPAUSE " ] &&
	ok "pause refused by a transient error: retried, failover only once paused" || ko "pause error: $(cat "$WORK/log")"
# The sentinel never promotes: the old master is unpaused and the failover fails.
echo ip-redis-0 >"$WORK/master"
: >"$STUB_SWAP"
: >"$WORK/log"
STUB_NO_PROMOTE=1 STUB_MASTER="$WORK/master" STUB_REDIS="1 1 new" bash "$SCRIPT" redis-last ns <"$WORK/app.yaml" >/dev/null 2>&1 && ko "failover without promotion succeeded" ||
	{ [ "$(grep -oE 'CLIENT [A-Z]+|REPLICAOF' "$WORK/log" | tail -n 1)" = "CLIENT UNPAUSE" ] && ! grep -q REPLICAOF "$WORK/log" &&
		ok "sentinel never promotes: old master unpaused, failover fails"; } || ko "no promotion: $(tail -n 5 "$WORK/log")"
rm "$WORK/bin/sleep"
STUB_NO_REDIS=1 bash "$SCRIPT" without-redis ns <"$WORK/app.yaml" | cmp -s - "$WORK/app.yaml" &&
	ok "without-redis keeps the Redis StatefulSets on a first deploy" || ko "without-redis dropped documents on a first deploy"

# pre-migrate-backup (issue #2724): the Job of the db-backup CronJob, off-site only in production.
cat >"$WORK/job.json" <<'JSON'
{"kind": "Job", "spec": {"template": {"spec": {"containers": [{"name": "backup",
  "command": ["sh", "-c", "/scripts/backup-k8s.sh --components mongodb,mysql,checkpoints,spire,risk\n"],
  "envFrom": [{"secretRef": {"name": "trading-model-backup-s3", "optional": true}}],
  "env": [{"name": "METRICS_FILE", "value": "/backups/metrics/backup.prom"}, {"name": "BACKUP_REQUIRE_OFFSITE", "value": "true"},
    {"name": "BACKUP_S3_BUCKET", "valueFrom": {"secretKeyRef": {"name": "trading-model-backup-s3", "key": "BACKUP_S3_BUCKET"}}}]}]}}}}
JSON
export STUB_JOB_JSON="$WORK/job.json"
premigrate() { : >"$WORK/applied"; GITHUB_STEP_SUMMARY="$WORK/summary" bash "$SCRIPT" pre-migrate-backup ns job-1 "$1" >/dev/null 2>&1; }
: >"$WORK/summary"
premigrate staging && jq -e '.spec.template.spec.containers[0] | (.command[2] | test("--components mysql\n$"))
	and ([.env[] | select(.name == "BACKUP_S3_BUCKET")] == [{name: "BACKUP_S3_BUCKET", value: ""}])
	and ([.env[] | select(.name == "BACKUP_REQUIRE_OFFSITE")] == [{name: "BACKUP_REQUIRE_OFFSITE", value: "false"}])
	and ([.env[] | select(.name == "METRICS_FILE")] == [{name: "METRICS_FILE", value: "/tmp/premigrate.prom"}])' "$WORK/applied" >/dev/null &&
	grep -q "local only" "$WORK/summary" &&
	ok "pre-migrate-backup outside production: MySQL only, no off-site copy, own metrics" || ko "pre-migrate staging: $(cat "$WORK/applied")"
no_cmd='del(.spec.template.spec.containers[0].command)'
premigrate production && [ "$(jq -S "$no_cmd" "$WORK/applied")" = "$(jq -S "$no_cmd" "$WORK/job.json")" ] &&
	jq -e '.spec.template.spec.containers[0].command[2] | test("--components mysql\n$")' "$WORK/applied" >/dev/null &&
	ok "pre-migrate-backup in production: the CronJob template, off-site required" || ko "pre-migrate production: $(cat "$WORK/applied")"
STUB_JOB_STATE=Failed premigrate staging && ko "pre-migrate-backup passed on a failed dump" || ok "pre-migrate-backup fails on a failed Job"

: >"$WORK/log"
: >"$WORK/applied"
STUB_PODS=node-1 bash "$SCRIPT" prepull ns <"$WORK/render.yaml" >/dev/null &&
	[ "$(grep -c '^ *nodeName: node-1$' "$WORK/applied")" -eq 2 ] && grep -q "image: r/risk-execution@sha256:" "$WORK/applied" &&
	[ "$(grep -c '^delete pod prepull-' "$WORK/log")" -eq 2 ] &&
	ok "prepull pulls the image N on the node of each Recreate pod, then deletes the pods" || ko "prepull: $(cat "$WORK/log")"
: >"$WORK/log"
out="$(STUB_WAIT_FAILS=1 STUB_PODS=node-1 bash "$SCRIPT" prepull ns <"$WORK/render.yaml" 2>&1)" &&
	[[ $out == *"::warning::Pre-pull"* ]] && grep -q '^delete pod prepull-risk-execution' "$WORK/log" &&
	ok "a failed pre-pull only warns" || ko "prepull failure: $out"

# Rollback guard (issue #3021): a live migration the target lacks is refused, never migrated down.
mkdir -p "$WORK/migs" && : >"$WORK/migs/001_a.up.sql" && : >"$WORK/migs/001_a.down.sql"
STUB_MASTER= STUB_IDS='001_a
' bash "$SCRIPT" schema-check ns "$WORK/migs" >/dev/null 2>&1 &&
	ok "schema-check: known schema passes" || ko "schema-check refused a known schema"
out="$(STUB_MASTER= STUB_IDS='001_a
002_b
' bash "$SCRIPT" schema-check ns "$WORK/migs" 2>&1)" &&
	ko "schema-check accepted a newer schema" || { [[ "$out" == *"002_b"* ]] && ok "schema-check: newer schema refused, names 002_b" || ko "schema-check message: $out"; }

: >"$WORK/log"
echo x | STUB_NETPOL="keep default-deny-all" bash "$SCRIPT" prune-network-policies ns >/dev/null &&
	[ "$(grep -c '^delete ' "$WORK/log")" -eq 1 ] && grep -q '^delete -n ns networkpolicy/default-deny-all$' "$WORK/log" &&
	ok "prune-network-policies deletes only the policy the render lacks" || ko "prune-network-policies: $(cat "$WORK/log")"

# Token expiry check of the "Configure kubeconfigs" step of deploy.yml (issue #1978): fake kubeconfigs holding only a JWT.
jwt() { printf '{"exp":%s}' "$1" | base64 -w0 | tr '+/' '-_' | tr -d '='; }
mkdir -p "$WORK/kube" "$WORK/bin"
printf '#!/bin/sh
cat "$KUBECONFIG"
' >"$WORK/bin/kubectl"
chmod +x "$WORK/bin/kubectl"
sed -n '/# token-expiry:begin/,/# token-expiry:end/p' "$ROOT/.github/workflows/deploy.yml" | sed 's/^ *//' >"$WORK/expiry.sh"
expiry() { # $1 exp of the app token, cluster token always valid
	echo "h.$(jwt "$1").s" >"$WORK/kube/config"; echo "h.$(jwt $(($(date +%s) + 999999))).s" >"$WORK/kube/cluster"
	RUNNER_TEMP="$WORK" upper=STAGING PATH="$WORK/bin:$PATH" bash "$WORK/expiry.sh" 2>&1
}
out="$(expiry 1700000000)" && ko "expired token accepted" ||
	{ [[ "$out" == *"::error::KUBECONFIG_STAGING_APP token expired on 2023-11-14 22:13 UTC"*"deploy-identity.sh app"* ]] && ok "expired token: error with date and regeneration command" || ko "expired: $out"; }
out="$(expiry $(($(date +%s) + 3600)))" && [[ "$out" == *"::warning::KUBECONFIG_STAGING_APP token expires on"* ]] && ok "token expiring in 1 h: warning" || ko "soon: $out"
out="$(expiry $(($(date +%s) + 999999)))" && [ -z "$out" ] && ok "valid token: silent" || ko "valid: $out"


bash "$SCRIPT" bogus >/dev/null 2>&1 && ko "unknown command accepted" || ok "unknown command refused"

exit "$FAILED"
