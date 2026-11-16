#!/usr/bin/env bash
# Kubernetes smoke test on kind: deploys release N-1 (the staging overlay and
# images of an earlier commit), upgrades it to N (this checkout) through the
# steps deploy.yml runs (deploy/k8s/scripts/deploy-release.sh: images pinned by
# digest, migrations, rollout, smoke test), forces a failed upgrade and checks
# the rollback, then checks the stack works end to end. Used by the `k8s` CI
# job; runs locally too.
#
#   tests/k8s/run-kind.sh [all|images|load|cluster|deploy|upgrade|smoke|verify|verify_replicas|verify_egress|verify_mongo_ingress|verify_db_ingress|verify_mysql_tls|verify_redis_tls|verify_canary|verify_release|verify_alerts|verify_backup|verify_traces|dump]
#
#   tests/k8s/run-kind.sh delete   # cluster + the images built for it
#
# Environment: KIND (binary, default `kind`), KIND_CLUSTER (default
# trading-model-ci), KEEP_CLUSTER=1 (`all` keeps the cluster afterwards),
# KIND_PREVIOUS_REF (release N-1, default HEAD^1: the base branch of a PR merge
# commit, the commit before on a push; locally e.g. origin/development),
# KIND_OVERLAY (overlay of both releases, default staging; staging-local keeps
# the data StatefulSets partitioned, issue #1066, e.g. with KIND_PREVIOUS_REF=v3.1.0-rc.1).
# Needs docker, git, kubectl, node, jq.
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
CERT_MANAGER="v1.21.3" # same as deploy/staging-local/bootstrap.sh
API_KEY="dev-token-0123456789abcdef0123456789abcdef" # secret of the AUTH_TOKENS key dev:read:<secret> injected by ci-render.mjs
SERVICES="discovery-server financial-scraper trader-trainer api-gateway audit-logger model-evaluator"
# First-party images: the IMAGES of deploy.yml.
IMAGES="$SERVICES spire-tools backup-tools db-migrate"
PREVIOUS_REF="${KIND_PREVIOUS_REF:-HEAD^1}"
# Release N-1 checkout, image digests, recorded revisions: kept between the
# steps of the CI job, removed by `delete`.
WORK="$(dirname "$ROOT")/.kind-${CLUSTER}"
PREVIOUS="$WORK/previous"
# Images of N-1 and N, saved by `images` (ci.yml job k8s-images), loaded by `load`.
IMAGE_ARCHIVE="${KIND_IMAGE_ARCHIVE:-$WORK/images.tar}"
export COMPOSE_PROJECT_NAME="tmk8s"
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-kind-ci}"
export GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-kind-ci}"
export MYSQL_EXPORTER_PASSWORD="${MYSQL_EXPORTER_PASSWORD:-kind-ci}"
# compose interpolates these (ADR-0067) even for `build`
for v in MONGO_ROOT_PASSWORD MONGO_EXPORTER_PASSWORD MONGO_BACKUP_PASSWORD MONGO_AUDIT_PASSWORD; do
	export "$v=${!v:-kind-ci}"
done

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

# Runs the command `"${@:2}"` up to `$1` times, 10 s apart. For calls that pull
# from an external registry (transient 504 / EOF): bounded and logged, the last
# failure is the caller's failure (set -e), never swallowed.
retry() {
	local tries="$1" n=1
	shift
	until "$@"; do
		if [ "$n" -ge "$tries" ]; then
			log "failed after $n attempts: $*"
			return 1
		fi
		log "attempt $n/$tries failed, retrying in 10 s: $*"
		n=$((n + 1))
		sleep 10
	done
}

# Builds the 10 images of the checkout `$1` as ghcr.io/trading-model/<image>:$2.
build_images() {
	local root="$1" tag="$2" svc
	# N-1 may predate a service: its image is a stand-in built from this checkout.
	local have="" missing=""
	for svc in $SERVICES; do
		if docker compose -f "$root/docker-compose.yml" config --services | grep -qx "$svc"; then have="$have $svc"; else missing="$missing $svc"; fi
	done
	# shellcheck disable=SC2086
	retry 3 docker compose -f "$root/docker-compose.yml" build $have spire-bootstrap
	# shellcheck disable=SC2086
	[ -z "$missing" ] || retry 3 docker compose -f "$ROOT/docker-compose.yml" build $missing
	retry 3 docker build -q -t "ghcr.io/trading-model/backup-tools:$tag" "$root/deploy/backup"
	# N-1 may predate the image: its digest entry is a stand-in built from this checkout.
	local mroot="$root"
	[ -f "$root/deploy/migrate/Dockerfile" ] || mroot="$ROOT"
	retry 3 docker build -q -t "ghcr.io/trading-model/db-migrate:$tag" -f "$mroot/deploy/migrate/Dockerfile" "$mroot"
	docker tag "${COMPOSE_PROJECT_NAME}-spire-bootstrap" "ghcr.io/trading-model/spire-tools:$tag"
	for svc in $SERVICES; do
		docker tag "${COMPOSE_PROJECT_NAME}-${svc}" "ghcr.io/trading-model/${svc}:$tag"
	done
}

# Release N-1: a worktree of $PREVIOUS_REF. Its service config gets one extra
# key, so that every hashed ConfigMap of N-1 differs from N's and the rollback
# check proves the configuration came back, not only the images.
previous_checkout() {
	git -C "$ROOT" worktree remove --force "$PREVIOUS" >/dev/null 2>&1 || rm -rf "$PREVIOUS"
	mkdir -p "$WORK"
	git -C "$ROOT" worktree add --detach "$PREVIOUS" "$PREVIOUS_REF" >/dev/null
	local file
	for file in "$PREVIOUS"/deploy/k8s/config/*.properties; do
		printf '\nKIND_RELEASE_MARKER=previous\n' >>"$file"
	done
	log "release N-1: $PREVIOUS_REF = $(git -C "$PREVIOUS" log -1 --format='%h %s')"
	[ -z "${GITHUB_STEP_SUMMARY:-}" ] ||
		echo "Release N-1: $PREVIOUS_REF = $(git -C "$PREVIOUS" rev-parse HEAD)" >>"$GITHUB_STEP_SUMMARY"
}

# "<image> <digest>" of the images tagged `$1` in the kind node, as deploy.yml
# resolves them in the registry. `kind load` imports images under their tag
# only: a reference by digest is added, so pods pinned by digest find them.
node_digests() {
	local node="${CLUSTER}-control-plane" img ref digest
	for img in $IMAGES; do
		ref="ghcr.io/trading-model/$img"
		digest="$(docker exec "$node" ctr -n k8s.io images ls "name==$ref:$1" | awk 'NR == 2 {print $3}')"
		[ -n "$digest" ] || {
			log "$ref:$1 is not in the kind node"
			return 1
		}
		docker exec "$node" ctr -n k8s.io images tag --force "$ref:$1" "$ref@$digest" >/dev/null
		echo "$img $digest"
	done
}

images() {
	local started=$SECONDS img
	previous_checkout
	log "building the images of release N-1"
	build_images "$PREVIOUS" previous
	# Same sources build the same image: a label keeps N-1 digests apart from N.
	for img in $IMAGES; do
		echo "FROM ghcr.io/trading-model/$img:previous" |
			docker build -q --label trading-model.kind-release=previous -t "ghcr.io/trading-model/$img:previous" - >/dev/null
	done
	log "  release N-1 images built in $((SECONDS - started)) s"
	log "building the images of release N (this checkout)"
	build_images "$ROOT" latest
	local images=""
	for img in $IMAGES; do images="$images ghcr.io/trading-model/$img:latest ghcr.io/trading-model/$img:previous"; done
	# One archive for every cluster job (ci.yml `k8s-images`): built once, loaded by `load`.
	log "saving the images to $IMAGE_ARCHIVE"
	mkdir -p "$(dirname "$IMAGE_ARCHIVE")"
	# shellcheck disable=SC2086
	docker save --platform linux/amd64 -o "$IMAGE_ARCHIVE" $images
}

# Loads the images saved by `images` into the kind cluster and records their
# digests, as the cluster jobs need them.
load() {
	previous_checkout
	log "loading the images into kind"
	# Also into the docker daemon: the drills run `docker run` on backup-tools:latest.
	docker load -i "$IMAGE_ARCHIVE" >/dev/null
	"$KIND" load image-archive --name "$CLUSTER" "$IMAGE_ARCHIVE"
	node_digests previous >"$WORK/digests-previous"
	node_digests latest >"$WORK/digests-current"
}

cluster() {
	if "$KIND" get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
		log "cluster $CLUSTER already exists"
	else
		# A failed create (kindest/node pull) leaves a half-made cluster: drop it between attempts.
		retry 3 bash -c '"$0" delete cluster --name "$1" >/dev/null 2>&1; "$0" create cluster --name "$1" --wait 180s' "$KIND" "$CLUSTER"
	fi
	# Prerequisite of mysql-tls.yaml (ADR-0060), as on a real cluster (deploy/staging-local/bootstrap.sh).
	kubectl config use-context "kind-${CLUSTER}" >/dev/null
	retry 3 kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER}/cert-manager.yaml"
	kubectl -n cert-manager rollout status deployment/cert-manager-webhook --timeout=300s
}

# Selects the credentials of the current (sub)shell. Once `identities` has run,
# every deploy step uses deploy-app (KUBECONFIG) and deploy-cluster
# (CLUSTER_KUBECONFIG) as deploy.yml does (ADR-0041); before, the kind admin.
use_kube() {
	if [ -f "$WORK/app.kubeconfig" ]; then
		export KUBECONFIG="$WORK/app.kubeconfig" CLUSTER_KUBECONFIG="$WORK/cluster.kubeconfig"
	else
		kubectl config use-context "kind-${CLUSTER}" >/dev/null
	fi
}

# The two restricted deploy identities, created as admin after the N-1 deploy
# (as in production: the admin bootstraps, the identities deploy), then the
# rights ADR-0041 promises are checked for real.
identities() {
	log "creating the deploy-app and deploy-cluster identities (admin)"
	(cd "$ROOT" && kubectl config use-context "kind-${CLUSTER}" >/dev/null &&
		bash scripts/deploy-identity.sh app --namespace "$NS" >"$WORK/app.kubeconfig" &&
		bash scripts/deploy-identity.sh cluster --namespace "$NS" --environment staging >"$WORK/cluster.kubeconfig") || return 1
	local out as_cluster="kubectl --kubeconfig $WORK/cluster.kubeconfig" as_app="kubectl --kubeconfig $WORK/app.kubeconfig"
	if out="$($as_cluster create clusterrolebinding x --clusterrole=spire-agent --serviceaccount="$NS:deploy-cluster" 2>&1)" ||
		! grep -qi forbidden <<<"$out"; then
		log "deploy-cluster could bind itself to spire-agent (or failed other than Forbidden): $out"
		return 1
	fi
	# stderr dropped: kubectl warns that nodes/proxy is not namespace scoped, which is not the answer
	[ "$($as_cluster auth can-i get nodes/proxy 2>/dev/null || true)" = no ] || {
		log "deploy-cluster can get nodes/proxy"
		return 1
	}
	[ "$($as_app auth can-i get secrets -n kube-system 2>/dev/null || true)" = no ] || {
		log "deploy-app can read Secrets of kube-system"
		return 1
	}
	log "  deploy-cluster: self-bind Forbidden, no nodes/proxy; deploy-app: no Secret in kube-system"
}

# deploy-release.sh (the release steps of deploy.yml) against the kind cluster.
release_script() {
	(cd "$ROOT" && use_kube &&
		bash deploy/k8s/scripts/deploy-release.sh "$@")
}

# The migrations of the checkout `$1`, through its own run-migrations.sh. For
# release N, the Secret of ci-render.mjs stands in for the SealedSecret file
# deploy.yml passes: its new keys are applied before the Jobs (issue #698).
migrations() {
	local sealed=""
	if [ "$1" = "$ROOT" ]; then
		sealed="$WORK/secret.yaml"
		node "$ROOT/tests/k8s/ci-render.mjs" --secret >"$sealed" || return 1
	fi
	(cd "$1" && use_kube &&
		SEALED_SECRETS_FILE="$sealed" SEED_MIGRATE_PASSWORD=true bash deploy/k8s/scripts/run-migrations.sh "$NS" ${2:+"$2"})
}

# The overlay of the checkout `$1`, pinned to the digests of file `$2` as
# deploy.yml's "Apply overlay", adapted to kind by ci-render.mjs.
# Release N-1 runs as if it predated the exporter keys (ADR-0056): they are
# dropped from its Secret and its exporters read another key, so N adds the
# keys and restarts the database pods, as a real upgrade to 3.1.0 (issue #698).
# Overlay of checkout $1 pinned to the digests of file $2, adapted to kind, into file $3.
# Each stage writes a file: node never shares a pipe with its producer (a node
# crash broke the pipe in runs 43321359421 and 43328471185).
render_kind() {
	release_script render "$1/deploy/k8s/overlays/${KIND_OVERLAY:-staging}" ghcr.io/trading-model "$2" >"$3.raw" || return 1
	node "$ROOT/tests/k8s/ci-render.mjs" <"$3.raw" >"$3" || return 1
	rm -f "$3.raw"
}

apply_release() {
	local rendered file
	file="$(mktemp "$WORK/rendered.XXXXXX")"
	render_kind "$1" "$2" "$file" || return 1
	rendered="$(cat "$file")"
	rm -f "$file"
	[ "$1" != "$PREVIOUS" ] || rendered="$(sed -E -e '/^  (MYSQL|REDIS)_EXPORTER_PASSWORD: /d' \
		-e 's/key: (MYSQL|REDIS)_EXPORTER_PASSWORD$/key: \1_EXPORTER_PASSWORD_BEFORE_ADR_0056/' <<<"$rendered")"
	if [ ! -f "$WORK/app.kubeconfig" ]; then
		echo "$rendered" | $K apply -f -
		return
	fi
	# As deploy.yml: cluster-scope documents with deploy-cluster, the rest with deploy-app.
	echo "$rendered" | bash "$ROOT/scripts/split-cluster-scope.sh" cluster |
		kubectl --kubeconfig "$WORK/cluster.kubeconfig" apply -f - || return 1
	# "Apply SPIFFE node components": the node agents of this checkout
	# (node-exporter is new in it, ADR-0056), with deploy-cluster.
	$K kustomize "$1/deploy/k8s/overlays/staging/node-agents" |
		kubectl --kubeconfig "$WORK/cluster.kubeconfig" apply -f - || return 1
	echo "$rendered" | bash "$ROOT/scripts/split-cluster-scope.sh" app >"$WORK/app.yaml"
	# Redis last, as deploy.yml: `release` applies it after the rollout (issue #1156).
	KUBECONFIG="$WORK/app.kubeconfig" bash "$ROOT/deploy/k8s/scripts/deploy-release.sh" without-redis "$NS" <"$WORK/app.yaml" |
		kubectl --kubeconfig "$WORK/app.kubeconfig" apply -f -
}

# Release #924 never creates the MongoDB root user on an empty cluster (its
# bootstrap sidecar reads system.users, which the localhost exception refuses),
# so its mongo-*-users Jobs fail and audit-logger never starts (run 43364583932).
# When N-1 is that release, root is created here as the fixed sidecar does and
# the Jobs run again. No-op for any other N-1, so a later regression of the
# bootstrap still fails the deploy. Remove once no N-1 carries the bug.
previous_mongo_root() {
	local label
	grep -q 'system.users.countDocuments' "$PREVIOUS/deploy/k8s/infra/mongodb.yaml" || return 0
	log "release N-1 cannot create the MongoDB root user (#924): created by the harness"
	for label in mongodb mongodb-audit; do
		wait_for 300 "mongo_primary $label"
		$K -n "$NS" exec "$(mongo_primary "$label")" -- sh -c 'mongosh --quiet --eval "
			try {
				db.getSiblingDB(\"admin\").createUser({ user: \"root\", pwd: process.env.MONGO_ROOT_PASSWORD, roles: [{ role: \"root\", db: \"admin\" }] });
			} catch (e) {
				if (e.codeName !== \"Unauthorized\") throw e;
			}"'
	done
	$K -n "$NS" delete job mongo-audit-users mongo-dlq-users --ignore-not-found
	apply_release "$PREVIOUS" "$WORK/digests-previous"
}

# First deploy of release N-1, as deploy.yml on an empty cluster.
deploy() {
	log "release N-1: node agents (SPIRE agent, SPIFFE CSI driver, promtail)"
	$K kustomize "$PREVIOUS/deploy/k8s/overlays/staging/node-agents" | $K apply -f -
	# The overlay mounts the SPIFFE CSI socket: the driver must be registered first, or
	# audit-logger crash-loops past its progress deadline (run 43331271388).
	# spire-agent is not waited for here: it needs the trust bundle of the overlay's spire-server.
	$K -n trading-model-node rollout status daemonset/spiffe-csi-driver --timeout=300s
	# hostPath dirs are root:root and fsGroup skips hostPath: the trainer (uid 10001) must write (#1246).
	docker exec "${CLUSTER}-control-plane" install -d -o 10001 -g 10001 /var/local/kind-rwx/trainer-checkpoints
	$K apply -f "$ROOT/tests/k8s/kind-fixtures.yaml"

	# As deploy.yml: the receivers exist before Alertmanager starts, or its
	# failed notifications fire AlertmanagerNotificationsFailing.
	alert_credentials

	log "release N-1: staging overlay, images pinned by digest"
	apply_release "$PREVIOUS" "$WORK/digests-previous"
	# The TLS consumers (redis-sentinel, mysql, mongo) need their CA secrets: cert-manager
	# never created them in run 43331271388. Bounded: a missing CA fails here, not 10 min later.
	# Ingress certificates (letsencrypt-prod, ACME) cannot be issued without internet: left out.
	local certs
	# None before TLS (v3.1.0-rc.1, KIND_OVERLAY=staging-local).
	certs="$($K -n "$NS" get certificate -o name | grep -vE '/(api|grafana)-trading-model-tls$' || true)"
	[ -z "$certs" ] || $K -n "$NS" wait --for=condition=Ready $certs --timeout=300s
	previous_mongo_root
	$K -n "$NS" create configmap binance-stub \
		--from-file=server.mjs="$ROOT/tests/e2e/binance-stub/server.mjs" \
		--dry-run=client -o yaml | $K apply -f -
	$K -n "$NS" apply -f "$ROOT/tests/k8s/binance-stub.yaml"

	log "waiting for MySQL, then applying the migrations of release N-1"
	# 600 s/300 s: run 42498902230, cold deploy of N-1 took 4 m 25 s in all, slowest Deployment
	# (collector) ~65 s, api-gateway ~77 s; DaemonSets ready within 3 s. Verify rollouts (3 replicas,
	# rolling restart): discovery-server 35 s. Margins kept for slower runners.
	$K -n "$NS" rollout status statefulset/mysql --timeout=600s
	migrations "$PREVIOUS"

	log "waiting for every workload"
	for workload in $($K -n "$NS" get deployment,statefulset -o name); do
		$K -n "$NS" rollout status "$workload" --timeout=600s
	done
	for workload in $($K -n trading-model-node get daemonset -o name); do
		$K -n trading-model-node rollout status "$workload" --timeout=300s
	done
}

# Applied migrations: "<id> <checksum>" per line.
applied_migrations() {
	mysql_root "SELECT id, checksum FROM financial_scraper._migrations ORDER BY id"
}

# Pod template of every Deployment (images, hashed ConfigMaps), one JSON line each.
templates() {
	local dep
	for dep in $(release_script deployments); do
		echo "$dep $($K -n "$NS" get deployment "$dep" -o json | jq -cS .spec.template)"
	done
}

# One release attempt in the order of deploy.yml: migrations, revisions
# recorded, replicas released, overlay of this checkout pinned to the digests
# of `$1`, rollout (base timeout `$2`, default 180s), smoke test.
release() {
	migrations "$ROOT" || return 1
	release_script record "$NS" "$WORK/revisions" || return 1
	release_script release-replicas "$NS" || return 1
	apply_release "$ROOT" "$1" || return 1
	release_script wait "$NS" "${2:-180s}" || return 1
	release_script redis-last "$NS" <"$WORK/app.yaml" || return 1
	# Binds the users to their client certificates once mysql-0 serves the cert-manager certificate.
	migrations "$ROOT" user-only || return 1
	deploy_script smoke-test || return 1
	release_script forget "$NS"
}

# shellcheck source=tests/k8s/probe-availability.sh
. "$(dirname "${BASH_SOURCE[0]}")/probe-availability.sh"

# The final upgrade to N under the probe: `release` runs while requests flow
# through edge-proxy to discovery-server, trader-trainer (Lease handover,
# ADR-0067) and financial-scraper (PROBE_ROUTES) and market candles are
# written. Fails above
# PROBE_MAX_FAILURES (default 0: a release must not drop a request) failed
# requests or when a candle of BTCUSDT is missing (gap above one interval,
# 1 minute: the stub serves 1m klines) during the window.
release_under_probe() {
	local stop="$WORK/probe.stop" out="$WORK/probe.count" max="${PROBE_MAX_FAILURES:-0}" pid start rc=0 began=$SECONDS
	local requests failures row candles gap need
	rm -f "$stop" "$out"
	echo "0 0" >"$out"
	probe_availability "$stop" "$out" &
	pid=$!
	# A failing command under errexit must not leave the probe running.
	# Expanded now: the locals are gone when a RETURN trap runs.
	# shellcheck disable=SC2064
	trap "touch '$stop'; kill $pid 2>/dev/null || true; trap - RETURN" RETURN
	start="$(mysql_root "SELECT UTC_TIMESTAMP(3)" | tr -d '\r')"
	[ -n "$start" ] || {
		log "could not read the window start from MySQL"
		return 1
	}
	release "$WORK/digests-current" || rc=$?
	touch "$stop"
	wait "$pid" || true
	read -r requests failures <"$out"
	log "  availability during the upgrade: $requests requests, $failures failed (threshold $max)"
	[ -z "${GITHUB_STEP_SUMMARY:-}" ] ||
		echo "Availability probe during the upgrade to N (edge-proxy, $PROBE_ROUTES): $requests requests, $failures failed (threshold $max)" >>"$GITHUB_STEP_SUMMARY"
	[ "$rc" = 0 ] || return "$rc"
	[ "$requests" -gt 0 ] || {
		log "the availability probe sent no request"
		return 1
	}
	[ "$failures" -le "$max" ] || {
		log "the upgrade dropped $failures request(s) (threshold $max): a Deployment went to 0 ready pods"
		return 1
	}
	# Candles written in the window and the largest gap between consecutive ones
	# (the last one before the window included). timestamp is the UTC open time
	# stored by the collector. shortcut: it sees candle open times only, and the
	# collector backfills, so a missed scrape that heals is not seen; measure the
	# write delay (created_at) if that ever matters.
	# One candle per minute: expect floor(window / 60) - 1, at least 1. A
	# collector pod replaced by the rollout can miss the :00 scrape (CI run
	# 42528580742: 0 candles in a 72 s window), so wait up to 90 s after the
	# window for it to write (it backfills) before judging.
	need=$(((SECONDS - began) / 60 - 1))
	[ "$need" -ge 1 ] || need=1
	local deadline=$((SECONDS + 90))
	while :; do
		row="$(mysql_root "SELECT COUNT(CASE WHEN timestamp >= '$start' THEN 1 END), COALESCE(MAX(TIMESTAMPDIFF(SECOND, prev, timestamp)), 0) FROM (SELECT timestamp, LAG(timestamp) OVER (ORDER BY timestamp) AS prev FROM financial_scraper.market_candles WHERE symbol='BTCUSDT' AND interval_value='1m' AND timestamp >= '$start' - INTERVAL 2 MINUTE) c" | tr -d '\r')"
		read -r candles gap <<<"$row"
		[[ "$candles" =~ ^[0-9]+$ && "$gap" =~ ^[0-9]+$ ]] || {
			log "candle check failed: MySQL answered '$row'"
			return 1
		}
		{ [ "$candles" -lt "$need" ] && [ "$SECONDS" -lt "$deadline" ]; } || break
		sleep 5
	done
	log "  BTCUSDT 1m candles during the upgrade: $candles (need $need), largest gap ${gap}s"
	[ "$candles" -ge "$need" ] || {
		log "too few market candles during the upgrade: $candles < $need"
		return 1
	}
	[ "$gap" -le 60 ] || {
		log "a market candle was missed during the upgrade (gap ${gap}s > 60 s)"
		return 1
	}
}

# Upgrade N-1 to N the way deploy.yml does it (issue #413):
#   1. a failed upgrade (api-gateway pinned to a digest no registry has: its
#      rollout never completes) and "Rollback on failure"; every Deployment
#      must be back on its N-1 pod template (N-1 image digests and hashed
#      ConfigMaps), the N-1 migrations still applied (ADR-0040: N-1 runs on
#      schema N, a rollback never runs `down`);
#   2. `deploy-k8s.sh migrate-down 1` then the migrations again;
#   3. the upgrade to N, which must pass the smoke test.
upgrade() {
	local started=$SECONDS before_templates before_migrations
	# Admin step: ClusterRoles and bindings come from the admin; the identities only deploy.
	identities || return 1
	before_templates="$(templates)"
	before_migrations="$(applied_migrations)"
	[ -n "$before_migrations" ] || {
		log "release N-1 applied no migration"
		return 1
	}
	[ "$(exporter_users)" = 0 ] || {
		log "release N-1 already has the MySQL exporter user: the upgrade would not prove issue #698"
		return 1
	}

	# deploy.yml preflight (issue #805): server-side dry-run of release N with
	# deploy-app / deploy-cluster; it must pass and leave every pod template as it was.
	log "preflight: dry-run of release N with the deploy identities (deploy-release.sh dry-run)"
	render_kind "$ROOT" "$WORK/digests-current" "$WORK/preflight.yaml" || return 1
	release_script dry-run "$NS" "$ROOT/deploy/k8s/overlays/staging/node-agents" <"$WORK/preflight.yaml" || {
		log "the preflight dry-run of release N failed"
		return 1
	}
	[ "$(templates)" = "$before_templates" ] || {
		log "the preflight dry-run changed a Deployment"
		return 1
	}

	log "upgrade N-1 → N with a forced failure: api-gateway pinned to a digest that does not exist"
	sed 's/^api-gateway .*/api-gateway sha256:0000000000000000000000000000000000000000000000000000000000000000/' \
		"$WORK/digests-current" >"$WORK/digests-broken"
	# Short base timeout: this rollout can never complete (issue #486, was 210 s).
	if release "$WORK/digests-broken" 30s; then
		log "an upgrade whose api-gateway image does not exist passed"
		return 1
	fi
	# A re-run of deploy.yml records again before its own rollback: it must find N-1, not N (issue #1192).
	release_script record "$NS" "$WORK/revisions-rerun" >/dev/null
	cmp -s "$WORK/revisions" "$WORK/revisions-rerun" || {
		log "a re-run after the failed upgrade records other revisions than N-1"
		diff "$WORK/revisions" "$WORK/revisions-rerun" || true
		return 1
	}
	log "  the upgrade failed: rollback on failure (deploy-release.sh rollback)"
	# rollback waits for every restored resource; a Deployment new in N is deleted, so no global wait
	release_script rollback "$NS" "$WORK/revisions"
	[ -z "$($K -n "$NS" get configmap deploy-revisions --ignore-not-found -o name)" ] || {
		log "configmap/deploy-revisions left after a successful rollback: the next deploy would roll back to N-1"
		return 1
	}
	# The first N-1 → N attempt ran db-migrate-user once, before the overlay that
	# brings the exporter keys: the user exists only if their SealedSecret was
	# applied before the Job (issue #698). MySQL stays on N (not rolled back).
	$K -n "$NS" rollout status statefulset/mysql --timeout=600s
	[ "$(exporter_users)" = 1 ] || {
		log "no MySQL exporter user after the first upgrade attempt: run-migrations.sh did not apply the new Secret keys before db-migrate-user"
		return 1
	}
	log "  MySQL exporter user created before the overlay restarted MySQL"

	local dep template expected
	while read -r dep template; do
		expected="$(echo "$before_templates" | sed -n "s/^$dep //p")"
		[ -n "$expected" ] || continue # new in release N: deleted by the rollback
		[ "$template" = "$expected" ] || {
			log "$dep is not back on its N-1 pod template after the rollback"
			diff <(echo "$expected" | jq .) <(echo "$template" | jq .) || true
			return 1
		}
	done < <(templates)
	local image name digest
	for image in $(templates | cut -d' ' -f2- | jq -r '(.spec.initContainers // []) + .spec.containers | .[].image' |
		grep '^ghcr.io/trading-model/' | sort -u); do
		name="${image#ghcr.io/trading-model/}"
		digest="${name#*@}"
		name="${name%@*}"
		grep -qx "$name $digest" "$WORK/digests-previous" || {
			log "image $image is not the N-1 digest of $name"
			return 1
		}
	done
	# Every ConfigMap the templates read still exists, and at least one carries
	# the marker previous_checkout added to N-1's config (the byte-for-byte
	# template check above already pins every hashed ConfigMap name to N-1's).
	local config marked=0
	for config in $(templates | cut -d' ' -f2- | jq -r '.. | objects | (.configMapRef, .configMap) | objects | .name' | sort -u); do
		$K -n "$NS" get configmap "$config" >/dev/null || {
			log "ConfigMap $config of release N-1 is gone"
			return 1
		}
		[ "$($K -n "$NS" get configmap "$config" -o jsonpath='{.data.KIND_RELEASE_MARKER}')" != previous ] ||
			marked=$((marked + 1))
	done
	[ "$marked" -gt 0 ] || {
		log "no ConfigMap the Deployments read carries the N-1 marker: the configuration is not N-1's"
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
	# SVIDs from the CA of the wiped volume until they bootstrap again
	# (rebootstrap_mode, 1 min, ADR-0065). Restart them now and wait for the
	# CSI driver, or the writers cannot mount the Workload API socket and never
	# become ready.
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
	audit_grows last "$restored_last"
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
	log "  MongoDB (audit), MySQL and the SPIRE CA restored"
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
	local images="" img
	for img in $IMAGES; do images="$images ghcr.io/trading-model/$img:latest ghcr.io/trading-model/$img:previous"; done
	# shellcheck disable=SC2086
	docker rmi $images >/dev/null 2>&1 || true
	git -C "$ROOT" worktree remove --force "$PREVIOUS" >/dev/null 2>&1 || true
	rm -rf "$WORK"
	git -C "$ROOT" worktree prune || true
}

dump() {
	$K get pods -A -o wide || true
	$K -n "$NS" get events --field-selector type=Warning --sort-by=.lastTimestamp | tail -40 || true
	for pod in $($K -n "$NS" get pods --no-headers | awk '{split($2, r, "/")} r[1] != r[2] || $3 != "Running" {print $1}'); do
		echo "===== $pod"
		$K -n "$NS" logs "$pod" --all-containers --tail=60 || true
		# Why the last container died (exit code, reason) and what it said.
		$K -n "$NS" describe pod "$pod" | grep -E -A6 "Last State:" || true
		for c in $($K -n "$NS" get pod "$pod" -o jsonpath='{range .status.containerStatuses[?(@.restartCount>0)]}{.name} {end}'); do
			$K -n "$NS" logs "$pod" -c "$c" --previous --tail=30 2>&1 || true
		done
	done
	echo "===== mysql-0 (mysql)"
	$K -n "$NS" logs mysql-0 -c mysql --tail=60 2>&1 | cut -c1-300 || true
	# The databases of pods that look healthy: a restarted member may not serve.
	for pod in mongo-audit-0; do
		echo "===== $pod"
		$K -n "$NS" logs "$pod" -c mongodb --tail=40 2>&1 | cut -c1-300 || true
		$K -n "$NS" exec "$pod" -c mongodb -- mongosh --quiet --eval 'JSON.stringify(rs.status())' 2>&1 | cut -c1-600 || true
	done
	echo "===== spire-server (spire-entries)"
	$K -n "$NS" logs deploy/spire-server -c spire-entries --tail=40 2>&1 || true
	$K -n trading-model-node logs daemonset/spire-agent --tail=40 || true
	# The market data path and the audit trail, even when their pods look healthy (verify checks them).
	for workload in binance-stub financial-scraper-collector financial-scraper audit-logger discovery-server api-gateway; do
		echo "===== deployment/$workload"
		$K -n "$NS" logs "deployment/$workload" --all-containers --tail=80 2>&1 | grep -v 'x509 context' || true
	done
	prometheus_diagnostics
	echo "===== market data in MySQL"
	mysql_root "SELECT 'candles', COUNT(*) FROM financial_scraper.market_candles UNION ALL SELECT 'trades', COUNT(*) FROM financial_scraper.market_trades" 2>&1 || true
	mysql_diagnostics
}

# Which route and status code feed an SLO alert: non-zero 5xx over 1 h, SLI error ratios, firing alerts.
prometheus_diagnostics() {
	echo "===== Prometheus: 5xx by job/path/status (1 h), SLI error ratios, firing alerts"
	local q url="http://localhost:9090/api/v1" row='"\(.metric | to_entries | map("\(.key)=\(.value)") | join(" ")) \(.value[1])"'
	for q in 'sum by (job, path, status) (increase(http_requests_total{status=~"5..",path!~"/ping|/health/ready|/metrics"}[1h]))' \
		'slo:sli_error:ratio_rate5m' 'slo:sli_error:ratio_rate1h'; do
		echo "--- $q"
		$K -n "$NS" exec prometheus-0 -c prometheus -- wget -T 10 -qO- "$url/query?query=$(jq -rn --arg q "$q" '$q | @uri')" 2>&1 |
			jq -r ".data.result[] | select((.value[1] | tonumber) > 0) | $row" 2>&1 | head -40 || true
	done
	echo "--- alerts firing"
	$K -n "$NS" exec prometheus-0 -c prometheus -- wget -T 10 -qO- "$url/alerts" 2>&1 |
		jq -r '.data.alerts[] | select(.state == "firing") | "\(.labels | to_entries | map("\(.key)=\(.value)") | join(" ")) activeAt=\(.activeAt)"' 2>&1 | head -40 || true
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
	load
	deploy
	upgrade
	smoke
	verify
	;;
verify_group)
	case "${2:-}" in
	network) verify_network ;;
	observability) verify_observability ;;
	backup) verify_backup_group ;;
	*)
		echo "usage: $0 verify_group [network|observability|backup]" >&2
		exit 64
		;;
	esac
	;;
images | load | cluster | deploy | upgrade | smoke | verify | verify_replicas | verify_egress | verify_mongo_ingress | verify_db_ingress | verify_mysql_tls | verify_redis_tls | verify_canary | verify_identity_without_mysql | verify_release | verify_alerts | verify_backup | verify_traces | dump | delete) "$1" ;;
*)
	echo "usage: $0 [all|images|load|cluster|deploy|upgrade|smoke|verify|verify_group <network|observability|backup>|verify_replicas|verify_egress|verify_mongo_ingress|verify_db_ingress|verify_mysql_tls|verify_redis_tls|verify_canary|verify_identity_without_mysql|verify_release|verify_alerts|verify_backup|dump|delete]" >&2
	exit 64
	;;
esac
