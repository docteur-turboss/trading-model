#!/usr/bin/env bash
# Kubernetes smoke test on kind: deploys the staging overlay the way
# deploy.yml does (node agents, overlay, migrations) and checks the stack
# works end to end. Used by the `k8s` CI job; runs locally too.
#
#   tests/k8s/run-kind.sh [all|images|cluster|deploy|smoke|verify|verify_replicas|verify_egress|verify_canary|verify_release|verify_alerts|verify_backup|dump]
#
#   tests/k8s/run-kind.sh delete   # cluster + the images built for it
#
# Environment: KIND (binary, default `kind`), KIND_CLUSTER (default
# trading-model-ci), KEEP_CLUSTER=1 (`all` keeps the cluster afterwards).
# Needs docker, kubectl, node, jq (canary).
#
# `all` deletes the cluster when it ends: a forgotten cluster keeps the whole
# staging stack (databases, Prometheus, Loki) writing into the Docker Desktop
# disk image, which froze every container on the host once it filled C:.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Git Bash: a C:/... path works for bash and for native kubectl/docker, also
# with MSYS_NO_PATHCONV=1 (needed for the bare /paths passed to kubectl exec).
if command -v cygpath >/dev/null; then ROOT="$(cygpath -m "$ROOT")"; fi
KIND="${KIND:-kind}"
CLUSTER="${KIND_CLUSTER:-trading-model-ci}"
NS="trading-model-staging"
K="kubectl --context kind-${CLUSTER}"
API_KEY="dev-token-change-me" # staging secretGenerator (AUTH_TOKENS)
SERVICES="discovery-server message-manager financial-scraper trader-trainer api-gateway audit-logger dlq-service"
export COMPOSE_PROJECT_NAME="tmk8s"
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-kind-ci}"

log() { echo "[kind] $*"; }

# Step timings of the restore drill (JSON, job summary, budget).
# shellcheck source=../backup/drill-timings.sh
source "$(dirname "$0")/../backup/drill-timings.sh"

# Polls `$2` (a shell command) every 5s until it succeeds or `$1` seconds pass.
wait_for() {
	local timeout="$1" check="$2" waited=0
	until eval "$check" >/dev/null 2>&1; do
		if [ "$waited" -ge "$timeout" ]; then
			log "timed out after ${timeout}s: $check"
			return 1
		fi
		sleep 5
		waited=$((waited + 5))
	done
}

images() {
	log "building the service images and spire-tools"
	# shellcheck disable=SC2086
	docker compose -f "$ROOT/docker-compose.yml" build $SERVICES spire-bootstrap
	docker build -q -t ghcr.io/trading-model/backup-tools:latest "$ROOT/deploy/backup"
	local images="ghcr.io/trading-model/spire-tools:latest ghcr.io/trading-model/backup-tools:latest"
	docker tag "${COMPOSE_PROJECT_NAME}-spire-bootstrap" "ghcr.io/trading-model/spire-tools:latest"
	for svc in $SERVICES; do
		docker tag "${COMPOSE_PROJECT_NAME}-${svc}" "ghcr.io/trading-model/${svc}:latest"
		images="$images ghcr.io/trading-model/${svc}:latest"
	done
	log "loading the images into kind"
	# shellcheck disable=SC2086
	if ! "$KIND" load docker-image --name "$CLUSTER" $images; then
		# Docker's containerd image store keeps multi-platform indexes that
		# `kind load docker-image` cannot import: go through a single-platform archive.
		local archive
		archive="$(mktemp)"
		# shellcheck disable=SC2086
		docker save --platform linux/amd64 -o "$archive" $images
		"$KIND" load image-archive --name "$CLUSTER" "$archive"
		rm -f "$archive"
	fi
}

cluster() {
	if "$KIND" get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
		log "cluster $CLUSTER already exists"
	else
		"$KIND" create cluster --name "$CLUSTER" --wait 180s
	fi
}

deploy() {
	log "node agents (SPIRE agent, SPIFFE CSI driver, promtail)"
	$K kustomize "$ROOT/deploy/k8s/overlays/staging/node-agents" | $K apply -f -
	$K apply -f "$ROOT/tests/k8s/kind-fixtures.yaml"

	# As deploy.yml: the receivers exist before Alertmanager starts, or its
	# failed notifications fire AlertmanagerNotificationsFailing.
	alert_credentials

	log "staging overlay"
	$K kustomize --load-restrictor LoadRestrictionsNone "$ROOT/deploy/k8s/overlays/staging" |
		node "$ROOT/tests/k8s/ci-render.mjs" | $K apply -f -
	$K -n "$NS" create configmap binance-stub \
		--from-file=server.mjs="$ROOT/tests/e2e/binance-stub/server.mjs" \
		--dry-run=client -o yaml | $K apply -f -
	$K -n "$NS" apply -f "$ROOT/tests/k8s/binance-stub.yaml"

	log "waiting for MySQL, then applying the migrations"
	$K -n "$NS" rollout status statefulset/mysql --timeout=600s
	(cd "$ROOT" && kubectl config use-context "kind-${CLUSTER}" >/dev/null &&
		bash deploy/k8s/scripts/run-migrations.sh "$NS")

	log "waiting for every workload"
	for workload in $($K -n "$NS" get deployment,statefulset -o name); do
		$K -n "$NS" rollout status "$workload" --timeout=600s
	done
	for workload in $($K -n trading-model-node get daemonset -o name); do
		$K -n trading-model-node rollout status "$workload" --timeout=300s
	done
}

mysql_count() {
	$K -n "$NS" exec mysql-0 -- sh -c \
		"mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N financial_scraper -e 'SELECT COUNT(*) FROM $1'" 2>/dev/null
}

# Market data messages the trainer received (through message-manager).
trainer_received() {
	$K -n "$NS" exec deployment/financial-scraper -c financial-scraper -- 		curl -sk --cert /run/spire/svid/svid.pem --key /run/spire/svid/svid_key.pem 		https://trader-trainer:3000/metrics 2>/dev/null |
		awk '/^tt_market_data_received_total/ {print int($2)}'
}

# Messages message-manager dropped for lack of a subscriber, over its pods,
# logged since $1 (RFC 3339): drops before a subscriber's first subscription
# are expected at startup.
mm_dropped() {
	$K -n "$NS" logs -l app.kubernetes.io/component=message-manager \
		-c message-manager --tail=-1 --since-time="$1" --prefix 2>/dev/null |
		grep -c "Message dropped: no subscriber for its topic" || true
}

prometheus_targets_down() {
	$K -n "$NS" exec prometheus-0 -c prometheus -- \
		wget -qO- 'http://localhost:9090/api/v1/targets?state=active' |
		node -e 'const t=JSON.parse(require("fs").readFileSync(0,"utf8")).data.activeTargets;
			const down=t.filter((x)=>x.health!=="up");
			for (const x of down) console.error(`${x.labels.job}: ${x.health} ${x.lastError}`);
			process.exit(t.length>0 && down.length===0 ? 0 : 1)'
}

verify() {
	log "market data reaches MySQL (stub → scraper → MySQL)"
	wait_for 300 '[ "$(mysql_count market_candles)" -gt 0 ]'
	log "  candles=$(mysql_count market_candles) trades=$(mysql_count market_trades)"

	verify_replicas
	verify_egress

	log "external path: edge-proxy → api-gateway → discovery"
	$K -n "$NS" port-forward svc/edge-proxy 18449:8080 >/dev/null 2>&1 &
	local forward=$!
	trap 'kill $forward 2>/dev/null || true' RETURN
	wait_for 30 'curl -s -o /dev/null http://localhost:18449/'
	local url="http://localhost:18449/v1/discovery-server/services"
	[ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = "401" ] || {
		log "a request without API key was not rejected"
		return 1
	}
	wait_for 120 "curl -sf -H 'x-api-key: $API_KEY' $url | grep -q financial-scraper-service"
	log "  registered: $(curl -s -H "x-api-key: $API_KEY" "$url")"

	log "Prometheus scrapes every target over mTLS (SVID)"
	wait_for 180 prometheus_targets_down

	log "Loki receives the pod logs (promtail)"
	wait_for 180 "$K -n $NS exec loki-0 -- wget -qO- http://localhost:3100/loki/api/v1/label/component/values | grep -q discovery-server"

	verify_alerts
	verify_release
	verify_backup

	log "OK: the staging overlay works on Kubernetes"
}

# ci-render.mjs drops every internet egress rule: kind must enforce the
# NetworkPolicies for that to block anything (kindnet does since kind v0.24).
# Control: a pod of a namespace without policy reaches the same URL.
verify_egress() {
	local url="https://example.com"
	log "internet egress: refused to the collector, allowed without policy"
	$K run egress-control -n default --rm -i --restart=Never --quiet \
		--image=curlimages/curl:8.11.1 -- curl -s -o /dev/null -m 10 "$url" || {
		log "  the control pod has no internet: the check proves nothing"
		return 1
	}
	if $K -n "$NS" exec deploy/financial-scraper-collector -c financial-scraper-collector -- \
		node -e "fetch('$url',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(0),()=>process.exit(1))"; then
		log "  the collector reached $url: NetworkPolicy not enforced"
		return 1
	fi
}

# Production runs message-manager and discovery with 3 replicas (staging: 1).
# Subscriptions and instance tokens live in Redis: a subscription made on one
# replica routes the messages published on another, and a replica that just
# started serves them at once. A rolling restart of both must not drop a
# message nor stop the flow to the trainer.
verify_replicas() {
	local deployments="deployment/message-manager deployment/discovery-server"
	log "3 replicas of message-manager and discovery, then a rolling restart of both"
	# shellcheck disable=SC2086
	$K -n "$NS" scale $deployments --replicas=3
	for d in $deployments; do $K -n "$NS" rollout status "$d" --timeout=300s; done
	local before
	before="$(trainer_received)"
	wait_for 180 '[ "$(trainer_received)" -gt "'"${before:-0}"'" ]'
	log "  3 replicas: the trainer receives market data ($(trainer_received) messages)"

	local restarted_at
	restarted_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	# shellcheck disable=SC2086
	$K -n "$NS" rollout restart $deployments
	for d in $deployments; do $K -n "$NS" rollout status "$d" --timeout=300s; done
	before="$(trainer_received)"
	wait_for 180 '[ "$(trainer_received)" -gt "'"${before:-0}"'" ]' || {
		log "no market data reached the trainer after the rolling restart"
		return 1
	}
	local dropped
	dropped="$(mm_dropped "$restarted_at")"
	[ "${dropped:-0}" -eq 0 ] || {
		log "the restarted message-manager pods dropped $dropped message(s): no subscriber"
		return 1
	}
	log "  after the rolling restart: flow to the trainer resumed, no message dropped"

	# shellcheck disable=SC2086
	$K -n "$NS" scale $deployments --replicas=1
	for d in $deployments; do $K -n "$NS" rollout status "$d" --timeout=300s; done
}

# Runs deploy-k8s.sh against the kind cluster, as deploy.yml does.
deploy_script() {
	(cd "$ROOT" && kubectl config use-context "kind-${CLUSTER}" >/dev/null &&
		K8S_NAMESPACE="$NS" bash deploy/k8s/scripts/deploy-k8s.sh "$@")
}

# The post-rollout gate of deploy.yml: every service answers /health/ready.
smoke() {
	log "deploy smoke test (deploy-k8s.sh smoke-test)"
	deploy_script smoke-test
}

# The canary gate of deploy.yml on api-gateway: with traffic through
# edge-proxy the canary must get a share of it and pass the error-rate gate;
# without traffic the gate must fail (no signal verifies nothing).
verify_canary() {
	log "canary gate on api-gateway, traffic through edge-proxy"
	$K -n "$NS" port-forward svc/edge-proxy 18450:8080 >/dev/null 2>&1 &
	local forward=$! traffic=""
	trap 'kill $traffic $forward 2>/dev/null || true; deploy_script canary-cleanup api-gateway >/dev/null 2>&1 || true' RETURN
	wait_for 30 'curl -s -o /dev/null http://localhost:18450/'
	# 2 requests/s: the gateway limits each API client to 100/min per pod.
	(while :; do
		curl -s -o /dev/null -H "x-api-key: $API_KEY" http://localhost:18450/v1/discovery-server/services
		sleep 0.5
	done) >/dev/null 2>&1 &
	traffic=$!
	export CANARY_IMAGE_REPO=ghcr.io/trading-model CANARY_GATE_SECONDS=60 CANARY_MIN_REQUESTS=20
	deploy_script canary api-gateway latest 10
	deploy_script canary-cleanup api-gateway

	kill "$traffic"
	traffic=""
	log "  without traffic the canary gate must fail"
	if CANARY_GATE_SECONDS=20 deploy_script canary api-gateway latest 10; then
		log "a canary that served no request passed the gate"
		return 1
	fi
	log "  canary gate: passes with traffic, fails without"
}

# Alertmanager receivers pointed at the in-cluster sink (tests/k8s/alert-sink.yaml).
alert_credentials() {
	$K get namespace "$NS" >/dev/null 2>&1 || $K create namespace "$NS"
	$K -n "$NS" apply -f "$ROOT/tests/k8s/alert-sink.yaml"
	$K -n "$NS" create secret generic alertmanager-credentials \
		--from-literal=SLACK_WEBHOOK_URL=http://alert-sink:8080/slack \
		--from-literal=DEADMAN_URL=http://alert-sink:8080/deadman \
		--dry-run=client -o yaml | $K apply -f -
}

# Alerting end to end: Alertmanager credentials point at an in-cluster sink,
# the always-firing Watchdog must reach the dead man's switch URL, and the
# healthy stack must have no critical alert firing.
verify_alerts() {
	log "alerting: Prometheus → Alertmanager → receivers (Watchdog, no critical alert)"
	alert_credentials
	$K -n "$NS" rollout status deployment/alert-sink --timeout=180s
	# The optional Secret volume is filled by the kubelet's next sync.
	wait_for 300 "$K -n $NS exec deployment/alert-sink -- bun -e 'const r = await (await fetch(\"http://localhost:8080/received\")).json(); process.exit(r.some((x) => x.path === \"/deadman\" && x.alerts.includes(\"Watchdog\")) ? 0 : 1)'"
	log "  Watchdog delivered to the dead man's switch"
	# No critical alert on a healthy stack: checked by verify_release (deploy-k8s.sh verify-release).
}

# The functional gate of deploy.yml, same command: API through edge-proxy,
# fresh market data, no critical alert. One pass (no observation window).
prom_diag() {
	local q
	echo "===== DIAG prometheus: date pod / runner"; $K -n "$NS" exec prometheus-0 -c prometheus -- date -u; date -u
	echo "===== DIAG targets financial-scraper*"
	$K -n "$NS" exec prometheus-0 -c prometheus -- wget -qO- 'http://localhost:9090/api/v1/targets?state=active' |
		node -e 'const t=JSON.parse(require("fs").readFileSync(0,"utf8")).data.activeTargets;
			console.log("targets:", t.length);
			for (const x of t) console.log(JSON.stringify({labels:x.labels,health:x.health,lastScrape:x.lastScrape,dur:x.lastScrapeDuration,err:x.lastError,url:x.scrapeUrl}))'
	for q in 'up' 'count(up)' 'time()' 'prometheus_tsdb_head_series' 'prometheus_tsdb_head_samples_appended_total' 'scrape_samples_scraped' 'scrape_samples_post_metric_relabeling' 'fs_candles_persisted_total' 'prometheus_target_scrapes_sample_out_of_bounds_total' 'prometheus_target_scrapes_sample_out_of_order_total'; do
		echo "===== DIAG query $q"
		$K -n "$NS" exec prometheus-0 -c prometheus -- wget -qO- "http://localhost:9090/api/v1/query?query=$(node -p 'encodeURIComponent(process.argv[1])' "$q")" | cut -c1-3000; echo
	done
	echo "===== DIAG series match fs_candles"
	$K -n "$NS" exec prometheus-0 -c prometheus -- wget -qO- 'http://localhost:9090/api/v1/label/__name__/values' | cut -c1-4000; echo
	echo "===== DIAG prometheus flags/runtime"
	$K -n "$NS" exec prometheus-0 -c prometheus -- wget -qO- 'http://localhost:9090/api/v1/status/runtimeinfo'; echo
	$K -n "$NS" exec prometheus-0 -c prometheus -- wget -qO- 'http://localhost:9090/api/v1/status/tsdb' | cut -c1-2000; echo
	echo "===== DIAG prometheus logs"
	$K -n "$NS" logs prometheus-0 -c prometheus --tail=120 || true
}

verify_release() {
	prom_diag || true
	log "release gate (deploy-k8s.sh verify-release)"
	VERIFY_WINDOW_SECONDS=0 deploy_script verify-release
}

# The writable primary of the MongoDB replica set labelled `$1`.
mongo_primary() {
	local pod
	for pod in $($K -n "$NS" get pods -l "app.kubernetes.io/component=$1" -o jsonpath='{.items[*].metadata.name}'); do
		if [ "$($K -n "$NS" exec "$pod" -- mongosh --quiet --eval 'db.hello().isWritablePrimary' 2>/dev/null)" = "true" ]; then
			echo "$pod"
			return 0
		fi
	done
	return 1
}

mongo_eval() {
	$K -n "$NS" exec "$(mongo_primary "$1")" -- mongosh --quiet --eval "$2"
}

mysql_root() {
	$K -n "$NS" exec mysql-0 -c mysql -- sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -N -e \"$1\""
}

# sha256 of the SPIRE trust bundle: unchanged as long as the CA keys are.
spire_bundle() {
	$K -n "$NS" exec deployment/spire-server -c spire-server -- \
		/opt/spire/bin/spire-server bundle show -socketPath /run/spire/server-sockets/api.sock | sha256sum | cut -d' ' -f1
}

runner() {
	$K -n "$NS" exec restore-runner -- sh -c "$1"
}

inspector() {
	$K -n "$NS" exec backup-inspector -- sh -c "$1"
}

# The real audit trail: tests/backup/audit-chain.js on the `audit` database
# (JSON: count, first, last, digest, broken).
audit_chain() {
	mongo_eval mongodb-audit "const AUDIT_DB = 'audit'; $(cat "$ROOT/tests/backup/audit-chain.js")"
}

# Field `$1` of the JSON object read on stdin.
json_field() {
	node -e 'const v = JSON.parse(require("fs").readFileSync(0, "utf8"))[process.argv[1]]; console.log(v === null ? "null" : v)' "$1"
}

# Ids of the real dead letters (dlq-service), one per line.
dlq_ids() {
	mongo_eval mongodb "db.getSiblingDB('dlq').dlq_entries.find({}, {_id: 1}).sort({_id: 1}).forEach((d) => print(d._id.toHexString ? d._id.toHexString() : String(d._id)))"
}

# Metric `$1` of the audit-logger pods (one value per pod).
audit_metric() {
	local pod
	for pod in $($K -n "$NS" get pods -l app.kubernetes.io/component=audit-logger -o jsonpath='{.items[*].metadata.name}'); do
		$K -n "$NS" exec "$pod" -c audit-logger -- curl -sk --cert /run/spire/svid/svid.pem 			--key /run/spire/svid/svid_key.pem https://localhost:3000/metrics 2>/dev/null |
			awk -v name="$1" '$1 == name {print int($2)}'
	done
}

# The services writing to the databases, stopped during a restore
# (BACKUP_DR.md): a write between the dump restore and the binlog / oplog
# replay would make the replay fail. The SPIRE server (MySQL `spire`
# database) is stopped and restarted by restore-k8s.sh itself.
MONGO_WRITERS="audit-logger dlq-service"
MYSQL_WRITERS="financial-scraper financial-scraper-collector"

# Restore drill: seeds known data, records the real audit trail (hash chain
# written by audit-logger from the live flow) and dead letters, runs the
# db-backup CronJob once (age key generated here, off-site copy to an
# in-cluster S3). Then point-in-time recovery (ADR-0031): more markers, audit
# events and a dead letter written after the dump, the writers stopped, the
# instant recorded, one marker written after it, and the
# db-backup-incremental CronJob run once. Destroys the data (the audit and
# dlq databases, drill markers, the market_candles table, the SPIRE server
# volume) and restores everything as after the loss of the cluster: the run
# and its binlog / oplog archives are fetched from the off-site bucket
# (scripts/fetch-offsite.sh --pitr) into a pod that never mounts backup-data,
# then restored with scripts/restore-k8s.sh --until the instant. Passes only if the data written up to the instant comes back and
# nothing after it, the SPIRE CA comes back, the audit chain is intact and
# still verifiable, audit-logger extends it after the restore, and the mesh
# works.
verify_backup() {
	drill_begin kind
	log "restore drill: seeding known data"
	local label
	for label in mongodb mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').markers.insertMany([{_id: 1}, {_id: 2}, {_id: 3}])" >/dev/null
	done
	mysql_root "CREATE DATABASE restore_drill; CREATE TABLE restore_drill.markers (id INT PRIMARY KEY); INSERT INTO restore_drill.markers VALUES (1), (2), (3);"
	local bundle_before
	bundle_before="$(spire_bundle)"

	log "restore drill: recording the real audit trail and dead letters"
	wait_for 300 '[ "$(audit_chain | json_field count)" -gt 0 ]'
	local audit_before audit_last dlq_before
	audit_before="$(audit_chain)"
	[ "$(echo "$audit_before" | json_field broken)" = "null" ] || {
		log "the audit chain is broken before any backup: $audit_before"
		return 1
	}
	audit_last="$(echo "$audit_before" | json_field last)"
	# A real dead letter, stored the way message-manager stores them: the flow
	# rarely produces one by itself.
	local dlq_seeded
	dlq_seeded="$($K -n "$NS" exec -i deployment/message-manager -c message-manager -- node - <"$ROOT/tests/k8s/dlq-seed.cjs")" || {
		log "message-manager could not store a dead letter in dlq-service"
		return 1
	}
	wait_for 60 'dlq_ids | grep -qx "'"$dlq_seeded"'"' || {
		log "dead letter $dlq_seeded is not in MongoDB"
		return 1
	}
	dlq_before="$(dlq_ids)"
	log "  audit chain verified: $(echo "$audit_before" | json_field count) events up to sequence $audit_last;" \
		"$(echo -n "$dlq_before" | grep -c . || true) dead letter(s)"

	log "encrypted backup (db-backup CronJob, age, off-site copy)"
	$K -n "$NS" apply -f "$ROOT/tests/k8s/backup-s3.yaml"
	$K -n "$NS" rollout status deployment/backup-s3 --timeout=120s
	local key recipient
	key="$(docker run --rm --entrypoint age-keygen ghcr.io/trading-model/backup-tools:latest 2>/dev/null)"
	recipient="$(echo "$key" | sed -n 's/^# public key: //p')"
	$K -n "$NS" create configmap backup-encryption --from-literal=BACKUP_AGE_RECIPIENTS="$recipient" \
		--dry-run=client -o yaml | $K apply -f -
	$K -n "$NS" delete job backup-ci --ignore-not-found
	local step_started=$SECONDS
	$K -n "$NS" create job backup-ci --from=cronjob/db-backup
	if ! $K -n "$NS" wait --for=condition=complete job/backup-ci --timeout=600s; then
		$K -n "$NS" logs job/backup-ci --tail=60 || true
		return 1
	fi
	drill_record backup_daily $((SECONDS - step_started))
	$K -n "$NS" logs job/backup-ci | grep -E '✓|✗|⚠' | sed 's/^/  /'

	$K -n "$NS" delete pod restore-runner backup-inspector --ignore-not-found
	$K -n "$NS" apply -f "$ROOT/tests/k8s/restore-runner.yaml"
	$K -n "$NS" wait --for=condition=ready pod/restore-runner pod/backup-inspector --timeout=120s
	# Paths stay inside `sh -c` strings: Git Bash (local runs on Windows)
	# rewrites bare /paths arguments into Windows paths.
	local clear
	clear="$(inspector "find /backups -type f ! -name '*.age' ! -path '/backups/metrics/*'")"
	if [ -n "$clear" ]; then
		log "unencrypted backup files: $clear"
		return 1
	fi
	inspector "grep -qx 'backup_encrypted 1' /backups/metrics/backup.prom"
	inspector "grep -qx 'backup_last_status{component=\"offsite\"} 1' /backups/metrics/backup.prom"
	local offsite
	offsite="$($K -n "$NS" exec deployment/backup-s3 -- sh -c "find /data/backups/staging -name '*.age' | wc -l")"
	# 5 dumps + 3 PITR starting points (mysql, mongodb, mongodb-audit) + the
	# run manifest (backup-lib.sh, write_manifest).
	[ "$offsite" -ge 9 ] || {
		log "only $offsite encrypted file(s) copied off-site (expected 9)"
		return 1
	}
	local listed
	listed="$(inspector "find /backups/manifests -name 'manifest_*.json.age' | wc -l")"
	[ "$listed" -ge 1 ] || {
		log "the backup run wrote no manifest: restore-k8s.sh would find nothing to restore"
		return 1
	}
	log "  every file is age-encrypted, $offsite copied off-site, run manifest written"

	log "point-in-time: writes after the daily dump (markers, audit events, a dead letter)"
	local audit_dumped
	audit_dumped="$(audit_chain | json_field last)"
	for label in mongodb mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').markers.insertOne({_id: 4})" >/dev/null
	done
	mysql_root "INSERT INTO restore_drill.markers VALUES (4);"
	local dlq_late
	dlq_late="$($K -n "$NS" exec -i deployment/message-manager -c message-manager -- node - <"$ROOT/tests/k8s/dlq-seed.cjs")" || {
		log "message-manager could not store a dead letter in dlq-service"
		return 1
	}
	wait_for 60 'dlq_ids | grep -qx "'"$dlq_late"'"' || {
		log "dead letter $dlq_late is not in MongoDB"
		return 1
	}
	# Audit events written by audit-logger after the dump.
	wait_for 300 '[ "$(audit_chain | json_field last)" -gt "'"$audit_dumped"'" ]'

	log "restore drill: writers stopped ($MONGO_WRITERS $MYSQL_WRITERS), as BACKUP_DR.md requires"
	local writer
	local -A replicas
	for writer in $MONGO_WRITERS $MYSQL_WRITERS; do
		replicas[$writer]="$($K -n "$NS" get deployment "$writer" -o jsonpath='{.spec.replicas}')"
		$K -n "$NS" scale deployment "$writer" --replicas=0
	done
	# financial-scraper-collector drains its candle backlog on shutdown
	# (terminationGracePeriodSeconds: 360): a writer still running would write
	# after the instant, or during the restore.
	for writer in $MONGO_WRITERS $MYSQL_WRITERS; do
		$K -n "$NS" wait --for=delete pod -l "app.kubernetes.io/component=$writer" --timeout=420s || true
		if [ -n "$($K -n "$NS" get pod -l "app.kubernetes.io/component=$writer" -o name)" ]; then
			log "writer $writer still has pods after 420 s: the point-in-time drill needs every writer stopped"
			return 1
		fi
	done

	# The state to get back: everything written up to the instant.
	local audit_pitr dlq_pitr until
	audit_pitr="$(audit_chain)"
	[ "$(echo "$audit_pitr" | json_field broken)" = "null" ] || {
		log "the audit chain is broken before the incremental backup: $audit_pitr"
		return 1
	}
	dlq_pitr="$(dlq_ids)"
	sleep 2
	until="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	sleep 2
	# After the instant: archived, but must not come back.
	for label in mongodb mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').markers.insertOne({_id: 5})" >/dev/null
	done
	mysql_root "INSERT INTO restore_drill.markers VALUES (5);"
	log "  instant $until: audit chain up to sequence $(echo "$audit_pitr" | json_field last) (dump: $audit_dumped)," \
		"$(echo -n "$dlq_pitr" | grep -c . || true) dead letter(s)"

	log "point-in-time: binlog and oplog archives (db-backup-incremental CronJob)"
	$K -n "$NS" delete job backup-incremental-ci --ignore-not-found
	step_started=$SECONDS
	$K -n "$NS" create job backup-incremental-ci --from=cronjob/db-backup-incremental
	if ! $K -n "$NS" wait --for=condition=complete job/backup-incremental-ci --timeout=600s; then
		$K -n "$NS" logs job/backup-incremental-ci --tail=60 || true
		return 1
	fi
	drill_record backup_incremental $((SECONDS - step_started))
	$K -n "$NS" logs job/backup-incremental-ci | grep -E '✓|✗|⚠' | sed 's/^/  /'
	clear="$(inspector "find /backups -type f ! -name '*.age' ! -path '/backups/metrics/*'")"
	if [ -n "$clear" ]; then
		log "unencrypted or partial backup files: $clear"
		return 1
	fi
	for component in mysql-binlog mongodb-oplog mongodb-audit-oplog; do
		inspector "grep -qx 'backup_last_status{component=\"$component\",run=\"incremental\"} 1' /backups/metrics/backup-incremental.prom" || {
			log "incremental archive of $component did not succeed"
			return 1
		}
		inspector "grep -qx 'backup_pitr_gap{component=\"$component\",run=\"incremental\"} 0' /backups/metrics/backup-incremental.prom" || {
			log "$component: chain reported broken (backup_pitr_gap) or not reported"
			return 1
		}
	done
	inspector "grep -qx 'backup_last_status{component=\"offsite\",run=\"incremental\"} 1' /backups/metrics/backup-incremental.prom"
	log "  archives encrypted and off-site"
	# From here on, the backup-data volume counts as lost with the cluster.
	$K -n "$NS" delete pod backup-inspector --wait=false

	drill_disaster
	step_started=$SECONDS
	log "restore drill: disaster (audit + dlq databases, markers, market_candles dropped, SPIRE volume deleted)"
	for label in mongodb mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').dropDatabase()" >/dev/null
	done
	mongo_eval mongodb-audit "db.getSiblingDB('audit').dropDatabase()" >/dev/null
	mongo_eval mongodb "db.getSiblingDB('dlq').dropDatabase()" >/dev/null
	[ "$(audit_chain | json_field count)" = "0" ] || {
		log "the audit database survived its drop: the drill tests nothing"
		return 1
	}
	mysql_root "DROP DATABASE restore_drill; DROP TABLE financial_scraper.market_candles;"
	local claim
	claim="$($K -n "$NS" get pvc spire-server-data -o json |
		node -e 'const p=JSON.parse(require("fs").readFileSync(0,"utf8"));
			console.log(JSON.stringify({apiVersion:"v1",kind:"PersistentVolumeClaim",
				metadata:{name:p.metadata.name,labels:p.metadata.labels},
				spec:{accessModes:p.spec.accessModes,resources:p.spec.resources}}))')"
	$K -n "$NS" scale deployment/spire-server --replicas=0
	$K -n "$NS" wait --for=delete pod -l app.kubernetes.io/component=spire-server --timeout=120s || true
	$K -n "$NS" delete pvc spire-server-data --wait=true
	echo "$claim" | $K -n "$NS" apply -f -
	$K -n "$NS" scale deployment/spire-server --replicas=1
	$K -n "$NS" rollout status deployment/spire-server --timeout=300s
	wait_for 60 "$K -n $NS exec deployment/spire-server -c spire-server -- /opt/spire/bin/spire-server healthcheck -socketPath /run/spire/server-sockets/api.sock"
	[ "$(spire_bundle)" != "$bundle_before" ] || {
		log "the SPIRE server kept its CA after losing its volume: the drill tests nothing"
		return 1
	}
	drill_record disaster $((SECONDS - step_started))

	log "restore drill: total loss, backup-data unused: scripts/fetch-offsite.sh --pitr from the off-site bucket"
	local claims
	claims="$($K -n "$NS" get pod restore-runner -o jsonpath='{.spec.volumes[*].persistentVolumeClaim.claimName}')"
	[ -z "$claims" ] || {
		log "restore-runner mounts $claims: the drill would not restore from the off-site copy"
		return 1
	}
	local started fetch_seconds restore_seconds fetched dir
	started=$SECONDS
	runner "bash /scripts/fetch-offsite.sh --pitr --dest /restore"
	fetch_seconds=$((SECONDS - started))
	drill_record fetch_offsite "$fetch_seconds"
	# The run: 5 dumps + 3 PITR starting points + the run manifest, which
	# restore-k8s.sh selects and verifies with; then the archives replayed.
	fetched="$(runner "find /restore -type f \( -name '*.archive.gz.age' -o -name 'financial_scraper_*.sql.gz.age' -o -name 'checkpoints_*.age' -o -name 'keys_*.age' -o -name '*.pitr.age' -o -name 'manifest_*.json.age' \) | wc -l")"
	[ "$fetched" -eq 9 ] && runner "test -s /restore/manifests/manifest_*.json.age" || {
		log "fetch-offsite.sh fetched $fetched file(s) of the run instead of 9 (5 dumps, 3 PITR starting points, run manifest)"
		return 1
	}
	for dir in mysql/binlog mongodb/oplog/mongodb mongodb/oplog/mongodb-audit; do
		[ "$(runner "find /restore/$dir -type f -name '*.gz.age' | wc -l")" -ge 1 ] || {
			log "fetch-offsite.sh --pitr fetched no archive into $dir"
			return 1
		}
	done

	# An instant the archives do not reach yet: refused before touching data.
	local refused
	if refused="$(echo "$key" | $K -n "$NS" exec -i restore-runner -- sh -c \
		"umask 077 && cat > /tmp/identity && BACKUP_DIR=/restore BACKUP_AGE_IDENTITY=/tmp/identity K8S_NAMESPACE=$NS \
		bash /scripts/restore-k8s.sh --dry-run --components mongodb,mysql --until $(date -u +%Y-%m-%dT%H:%M:%SZ) 2>&1; \
		rc=\$?; rm -f /tmp/identity; exit \$rc")"; then
		log "restore-k8s.sh --until accepted an instant after the last archive: $refused"
		return 1
	fi
	[ "$(echo "$refused" | grep -cE 'do not reach the requested instant|before the requested instant')" -eq 3 ] || {
		log "restore-k8s.sh --until refused for another reason: $refused"
		return 1
	}
	log "  run and archives fetched, an instant past the archives is refused"

	# The SPIRE server writes to the `spire` database the binlog replay
	# restores: stopped now, restarted by restore-k8s.sh with its CA keys.
	$K -n "$NS" scale deployment/spire-server --replicas=0
	$K -n "$NS" wait --for=delete pod -l app.kubernetes.io/component=spire-server --timeout=120s || true

	log "restore drill: scripts/restore-k8s.sh --until $until on the fetched run"
	started=$SECONDS
	# The identity goes through stdin and is deleted after the restore. The
	# output is kept: restore-k8s.sh logs the duration of each component.
	local restore_log
	restore_log="$(mktemp)"
	echo "$key" | $K -n "$NS" exec -i restore-runner -- sh -c \
		"umask 077 && cat > /tmp/identity && BACKUP_DIR=/restore BACKUP_AGE_IDENTITY=/tmp/identity K8S_NAMESPACE=$NS \
		bash /scripts/restore-k8s.sh --components mongodb,mysql,checkpoints,spire --until $until; rc=\$?; rm -f /tmp/identity; exit \$rc" |
		tee "$restore_log"
	restore_seconds=$((SECONDS - started))
	drill_record_components "$restore_log"
	rm -f "$restore_log"
	drill_record restore_total_host "$restore_seconds"
	log "  off-site fetch ${fetch_seconds} s, restore ${restore_seconds} s (total $((fetch_seconds + restore_seconds)) s)"

	log "restore drill: checking the restored data"
	step_started=$SECONDS
	# Markers 1-3 from the dump, 4 from the replay, never 5 (after the instant).
	for label in mongodb mongodb-audit; do
		local markers
		markers="$(mongo_eval "$label" "print(db.getSiblingDB('restore_drill').markers.find().sort({_id: 1}).toArray().map((m) => m._id).join(','))")"
		[ "$markers" = "1,2,3,4" ] || {
			log "MongoDB $label: drill markers $markers instead of 1,2,3,4"
			return 1
		}
	done
	local mysql_markers
	mysql_markers="$(mysql_root "SELECT GROUP_CONCAT(id ORDER BY id) FROM restore_drill.markers")"
	[ "$mysql_markers" = "1,2,3,4" ] || {
		log "MySQL: drill markers $mysql_markers instead of 1,2,3,4"
		return 1
	}
	[ "$(mysql_count market_candles)" -gt 0 ] || {
		log "MySQL: market_candles was not restored"
		return 1
	}
	[ "$(spire_bundle)" = "$bundle_before" ] || {
		log "the SPIRE trust bundle differs: the CA keys were not restored"
		return 1
	}
	# Up to the instant: every audit event written after the dump too, with
	# the same hashes, and every dead letter.
	local audit_restored
	audit_restored="$(audit_chain)"
	[ "$(echo "$audit_restored" | json_field broken)" = "null" ] || {
		log "the restored audit chain is broken: $audit_restored"
		return 1
	}
	local field
	for field in count first last digest; do
		[ "$(echo "$audit_restored" | json_field "$field")" = "$(echo "$audit_pitr" | json_field "$field")" ] || {
			log "the restored audit trail differs ($field): at the instant $audit_pitr, after $audit_restored"
			return 1
		}
	done
	local missing
	missing="$(comm -23 <(echo -n "$dlq_pitr" | sort) <(dlq_ids | sort))"
	[ -z "$missing" ] || {
		log "dead letters not restored: $missing"
		return 1
	}
	echo "$dlq_pitr" | grep -qx "$dlq_late" || {
		log "the dead letter written after the dump was not recorded"
		return 1
	}
	log "  audit trail restored up to the instant: $(echo "$audit_restored" | json_field count) events" \
		"(sequence $audit_dumped at the dump, $(echo "$audit_restored" | json_field last) restored), same hashes, chain verified"

	# Operator command (issue #322): same checks a real restore gets, read-only.
	log "restore drill: scripts/verify-restore-k8s.sh on the restored data"
	K8S_NAMESPACE="$NS" bash "$ROOT/scripts/verify-restore-k8s.sh" || {
		log "verify-restore-k8s.sh failed on a correctly restored cluster"
		return 1
	}
	# Negative test: one altered audit event must make it fail (then put back).
	local audit_hash
	audit_hash="$(mongo_eval mongodb-audit "const e = db.getSiblingDB('audit').audit_events.find().sort({chainSequence: -1}).limit(1).next(); print(e.dataHash)" | tail -1)"
	mongo_eval mongodb-audit "db.getSiblingDB('audit').audit_events.updateOne({dataHash: '$audit_hash'}, {\$set: {dataHash: 'tampered'}})" >/dev/null
	if K8S_NAMESPACE="$NS" bash "$ROOT/scripts/verify-restore-k8s.sh" >/dev/null 2>&1; then
		log "verify-restore-k8s.sh accepted an altered audit event"
		mongo_eval mongodb-audit "db.getSiblingDB('audit').audit_events.updateOne({dataHash: 'tampered'}, {\$set: {dataHash: '$audit_hash'}})" >/dev/null || true
		return 1
	fi
	mongo_eval mongodb-audit "db.getSiblingDB('audit').audit_events.updateOne({dataHash: 'tampered'}, {\$set: {dataHash: '$audit_hash'}})" >/dev/null
	log "  verify-restore-k8s.sh passes on the restore and fails on an altered audit event"

	# The SPIRE server came back with the restored CA: the agents still hold
	# SVIDs from the CA of the wiped volume and crash-loop until they re-attest.
	# Restart them and wait for the CSI driver, or the writers cannot mount the
	# Workload API socket and never become ready.
	drill_record verify_data $((SECONDS - step_started))
	step_started=$SECONDS
	log "restore drill: SPIRE agents re-attested against the restored CA"
	$K -n trading-model-node rollout restart daemonset/spire-agent
	for workload in $($K -n trading-model-node get daemonset -o name); do
		$K -n trading-model-node rollout status "$workload" --timeout=300s
	done

	drill_record spire_agents_reattest $((SECONDS - step_started))
	step_started=$SECONDS
	log "restore drill: writers restarted"
	for writer in $MONGO_WRITERS $MYSQL_WRITERS; do
		$K -n "$NS" scale deployment "$writer" --replicas="${replicas[$writer]}"
	done
	for writer in $MONGO_WRITERS $MYSQL_WRITERS; do
		$K -n "$NS" rollout status deployment "$writer" --timeout=300s
	done
	local restored_last
	restored_last="$(audit_chain | json_field last)"
	# New events must extend the restored chain, not start a new one.
	wait_for 300 '[ "$(audit_chain | json_field last)" -gt "'"$restored_last"'" ]'
	local audit_after
	audit_after="$(audit_chain)"
	[ "$(echo "$audit_after" | json_field broken)" = "null" ] || {
		log "audit-logger broke the chain after the restore: $audit_after"
		return 1
	}
	log "  audit-logger extends the restored chain (sequence $(echo "$audit_after" | json_field last))"
	# Its own verifier (ADR-0027) must agree: every pod verified the restored
	# chain and found it whole.
	wait_for 120 '[ -n "$(audit_metric audit_chain_verified_sequence)" ] && ! audit_metric audit_chain_verified_sequence | grep -qx 0'
	audit_metric audit_chain_broken | grep -qvx 0 && {
		log "audit-logger finds the restored chain broken"
		return 1
	}
	log "  audit-logger verified the restored chain up to $(audit_metric audit_chain_verified_sequence | sort -n | tail -1)"
	log "  MongoDB (dlq + audit), MySQL and the SPIRE CA restored"
	log "  workloads still get trusted SVIDs: Prometheus scrapes every target over mTLS"
	wait_for 300 prometheus_targets_down
	drill_record verify_services $((SECONDS - step_started))
	$K -n "$NS" delete pod restore-runner --wait=false
	# Default budget 1200 s: about 5 times the 252 s recovery window of the
	# first CI run, see tests/backup/drill-timings.sh.
	drill_finish 1200
}

delete() {
	"$KIND" delete cluster --name "$CLUSTER" || true
	# shellcheck disable=SC2086
	docker compose -f "$ROOT/docker-compose.yml" down --rmi local --volumes --remove-orphans >/dev/null 2>&1 || true
	local images="ghcr.io/trading-model/spire-tools:latest ghcr.io/trading-model/backup-tools:latest"
	for svc in $SERVICES; do images="$images ghcr.io/trading-model/${svc}:latest"; done
	# shellcheck disable=SC2086
	docker rmi $images >/dev/null 2>&1 || true
}

dump() {
	$K get pods -A -o wide || true
	$K -n "$NS" get events --field-selector type=Warning --sort-by=.lastTimestamp | tail -40 || true
	for pod in $($K -n "$NS" get pods --no-headers | awk '{split($2, r, "/")} r[1] != r[2] || $3 != "Running" {print $1}'); do
		echo "===== $pod"
		$K -n "$NS" logs "$pod" --all-containers --tail=60 || true
	done
	$K -n trading-model-node logs daemonset/spire-agent --tail=40 || true
	# The market data path, even when its pods look healthy (verify checks it).
	for workload in binance-stub financial-scraper-collector financial-scraper message-manager; do
		echo "===== deployment/$workload"
		$K -n "$NS" logs "deployment/$workload" --all-containers --tail=80 2>&1 | grep -v 'x509 context' || true
	done
	echo "===== message-manager drops and trainer subscription renewals (every pod)"
	$K -n "$NS" get pods -l app.kubernetes.io/component=message-manager \
		-o custom-columns=NAME:.metadata.name,STARTED:.status.startTime,READY:.status.conditions[?\(@.type==\"Ready\"\)].lastTransitionTime || true
	$K -n "$NS" logs -l app.kubernetes.io/component=message-manager -c message-manager --tail=-1 --prefix 2>/dev/null |
		grep -E "no subscriber|Subscri|Shutting|drain|listening" | cut -c1-400 || true
	$K -n "$NS" logs deployment/trader-trainer -c trader-trainer --tail=-1 2>/dev/null |
		grep -iE "subscri" | cut -c1-400 | tail -40 || true
	echo "===== market data in MySQL"
	mysql_root "SELECT 'candles', COUNT(*) FROM financial_scraper.market_candles UNION ALL SELECT 'trades', COUNT(*) FROM financial_scraper.market_trades" 2>&1 || true
	mysql_diagnostics
}

# What mysqld sees in the pod: which option files it can read, and why not.
mysql_diagnostics() {
	[ "$($K -n "$NS" get pod mysql-0 -o jsonpath='{.status.containerStatuses[?(@.name=="mysql")].ready}' 2>/dev/null)" = "true" ] && return 0
	echo "===== mysql-0 diagnostics"
	$K -n "$NS" get pod mysql-0 -o jsonpath='{.spec.securityContext}{"\n"}{.spec.containers[0].securityContext}{"\n"}{.status.containerStatuses[0].imageID}{"\n"}' || true
	$K -n "$NS" exec mysql-0 -c mysql -- sh -c '
		set -x
		id
		ls -la /etc/my.cnf /etc/mysql /etc/mysql/conf.d/ /usr/share/mysql-8.4/english/errmsg.sys
		cat /etc/my.cnf | grep -v "^#"
		cat /proc/1/cmdline | tr "\0" " "; echo
		env | grep -E "^(HOME|MYSQL_HOME|MYSQL_TEST|USER)=" || true
		mysqld --print-defaults
		my_print_defaults mysqld client
		mysqladmin --print-defaults
		ls -la /var/run/mysqld /var/lib/mysql/mysql.sock
		grep -E " /etc| /usr| / " /proc/mounts
		mysqld --print-defaults; echo "rc=$?"
		mysqld --verbose --help 2>&1 | grep -E "^(basedir|datadir|socket|lc-messages-dir|character-sets-dir) "
		grep -E "^(Seccomp|NoNewPrivs|Cap)" /proc/self/status
		uname -r
	' 2>&1 || true
	# A host AppArmor profile attached by path (usr.sbin.mysqld on the GitHub
	# runner) confines the pod's mysqld: it shows here.
	$K -n "$NS" exec mysql-0 -c mysql -- cat /proc/1/attr/current 2>&1 || true
}

case "${1:-all}" in
all)
	if [ "${KEEP_CLUSTER:-0}" != "1" ]; then
		trap 'rc=$?; [ "$rc" -eq 0 ] || dump; delete; exit $rc' EXIT
	fi
	cluster
	images
	deploy
	smoke
	verify
	verify_canary
	;;
images | cluster | deploy | smoke | verify | verify_replicas | verify_egress | verify_canary | verify_release | verify_alerts | verify_backup | dump | delete) "$1" ;;
*)
	echo "usage: $0 [all|images|cluster|deploy|smoke|verify|verify_replicas|verify_egress|verify_canary|verify_release|verify_alerts|verify_backup|dump|delete]" >&2
	exit 64
	;;
esac
