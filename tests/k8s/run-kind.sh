#!/usr/bin/env bash
# Kubernetes smoke test on kind: deploys release N-1 (the staging overlay and
# images of an earlier commit), upgrades it to N (this checkout) through the
# steps deploy.yml runs (deploy/k8s/scripts/deploy-release.sh: images pinned by
# digest, migrations, rollout, smoke test), forces a failed upgrade and checks
# the rollback, then checks the stack works end to end. Used by the `k8s` CI
# job; runs locally too.
#
#   tests/k8s/run-kind.sh [all|images|load|cluster|deploy|upgrade|smoke|verify|verify_egress|verify_mongo_ingress|verify_db_ingress|verify_mysql_tls|verify_redis_tls|verify_canary|verify_release|verify_alerts|verify_backup|verify_traces|dump]
#
#   tests/k8s/run-kind.sh delete   # cluster + the images built for it
#
# Environment: KIND (binary, default `kind`), KIND_CLUSTER (default
# trading-model-ci), KEEP_CLUSTER=1 (`all` keeps the cluster afterwards),
# KIND_PREVIOUS_REF (release N-1, default HEAD^1: the base branch of a PR merge
# commit, the commit before on a push; locally e.g. origin/development),
# KIND_PREVIOUS_REGISTRY (set: N-1 is the release tag KIND_PREVIOUS_REF, its
# signed images pulled from this registry instead of built; needs cosign; CI
# sets both to the last stable tag with published images),
# KIND_OVERLAY (overlay of both releases, default staging; staging-local keeps
# the data StatefulSets partitioned, issue #1066, e.g. with KIND_PREVIOUS_REF=v3.1.0-rc.1),
# KIND_FULL_ROLLBACK=0 (`upgrade` skips the full rollback N → N-1 and back; CI runs it in the backup group only).
# Needs docker, git, kubectl, node, jq.
#
# `all` deletes the cluster when it ends: a forgotten cluster keeps the whole
# staging stack (databases, Prometheus, Loki) writing into the Docker Desktop
# disk image, which froze every container on the host once it filled C:.
set -euo pipefail
# A failure inside $(...) stops the substitution too (bash ignores -e there
# by default): a 403 of seed_dead_letter went unnoticed (PR #1662).
shopt -s inherit_errexit

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
# Git Bash: a C:/... path works for bash and for native kubectl/docker, also
# with MSYS_NO_PATHCONV=1 (needed for the bare /paths passed to kubectl exec).
if command -v cygpath >/dev/null; then ROOT="$(cygpath -m "$ROOT")"; fi
KIND="${KIND:-kind}"
CLUSTER="${KIND_CLUSTER:-trading-model-ci}"
NS="trading-model-staging"
K="kubectl --context kind-${CLUSTER}"
CERT_MANAGER="v1.21.3" # same as deploy/staging-local/bootstrap.sh
CURL_IMAGE="curlimages/curl:8.11.1@sha256:c1fe1679c34d9784c1b0d1e5f62ac0a79fca01fb6377cdd33e90473c6f9f9a69" # multi-arch index, as realip.test.sh
API_KEY="dev-token-0123456789abcdef0123456789abcdef" # secret of the AUTH_TOKENS key dev:read+dlq:write:<secret> injected by ci-render.mjs
SERVICES="$(sed -n 's/^ *- \(.*\)\.yaml$/\1/p' "$ROOT/deploy/k8s/services/kustomization.yaml" | grep -vx edge-proxy | tr '\n' ' ')" # edge-proxy is not a first-party image
# First-party images: the IMAGES of deploy.yml.
IMAGES="$SERVICES spire-tools backup-tools db-migrate"
# Services only release N-1 runs (retired by #1244 and #1241): built for N-1 only; drop once N-1 is the release after.
RETIRED="discovery-server message-manager dlq-service"
PREVIOUS_REF="${KIND_PREVIOUS_REF:-HEAD^1}"
# Release N-1 checkout, image digests, recorded revisions: kept between the
# steps of the CI job, removed by `delete`.
WORK="$(dirname "$ROOT")/.kind-${CLUSTER}"
PREVIOUS="$WORK/previous"
# Images of N-1 and N, saved by `images` (ci.yml job k8s-images), loaded by `load`.
IMAGE_ARCHIVE="${KIND_IMAGE_ARCHIVE:-$WORK/images.tar}"
export COMPOSE_PROJECT_NAME="tmk8s"
export MYSQL_ROOT_PASSWORD="${MYSQL_ROOT_PASSWORD:-kind-ci}"
export MYSQL_PASSWORD="${MYSQL_PASSWORD:-kind-ci}"
export GRAFANA_PASSWORD="${GRAFANA_PASSWORD:-kind-ci}"
export MYSQL_EXPORTER_PASSWORD="${MYSQL_EXPORTER_PASSWORD:-kind-ci}"
export DLQ_AUTH_HMAC_SECRET="${DLQ_AUTH_HMAC_SECRET:-kind-ci-dlq-hmac-0123456789abcdefghij}"
# compose interpolates these (ADR-0067) even for `build` (N-1 still has MONGO_DLQ_PASSWORD)
for v in MONGO_ROOT_PASSWORD MONGO_EXPORTER_PASSWORD MONGO_BACKUP_PASSWORD MONGO_AUDIT_PASSWORD MONGO_DLQ_PASSWORD; do
	export "$v=${!v:-kind-ci}"
done

log() {
	echo "[kind] $*"
	echo "$*" 2>/dev/null >"$WORK/last-log" || true
}

# On failure, the last [kind] line (the cause, logged just before `return 1`)
# becomes the job annotation, not lost under the cluster dump.
fail_summary() {
	local rc="$1"
	shift
	[ "$rc" -eq 0 ] || [ ! -s "$WORK/last-log" ] || echo "::error title=run-kind.sh $*::$(cat "$WORK/last-log")"
	return "$rc"
}

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
	local root="$1" tag="$2" svc services="$SERVICES${3:+ $3}"
	# N-1 may predate a service: its image is a stand-in built from this checkout.
	local have="" missing=""
	# list first: `| grep -q` exits early and SIGPIPEs compose under pipefail
	local listed; listed=$(docker compose -f "$root/docker-compose.yml" config --services)
	for svc in $services; do
		if grep -qx "$svc" <<<"$listed"; then have="$have $svc"; else missing="$missing $svc"; fi
	done
	# shellcheck disable=SC2086
	local f="-f $root/docker-compose.yml"
	[ ! -f "$root/docker-compose.build.yml" ] || f="$f -f $root/docker-compose.build.yml"
	export IMAGE_TAG="$tag"
	retry 3 docker compose $f build $have spire-bootstrap
	# shellcheck disable=SC2086
	# Not built by its compose file: its own Dockerfile if it has one (N-1 probes may need what N dropped, e.g. curl), else this checkout's.
	for svc in $missing; do
		if [ -f "$root/services/$svc/Dockerfile" ]; then
			retry 3 docker build -q -t "ghcr.io/trading-model/$svc:$tag" -f "$root/services/$svc/Dockerfile" "$root"
		else
			retry 3 docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.build.yml" build "$svc"
		fi
	done
	retry 3 docker build -q -t "ghcr.io/trading-model/backup-tools:$tag" "$root/deploy/backup"
	# N-1 may predate the image: its digest entry is a stand-in built from this checkout.
	local mroot="$root"
	[ -f "$root/deploy/migrate/Dockerfile" ] || mroot="$ROOT"
	retry 3 docker build -q -t "ghcr.io/trading-model/db-migrate:$tag" -f "$mroot/deploy/migrate/Dockerfile" "$mroot"
	# N-1 (no `image:` in compose) builds as <project>-<svc>; N builds straight to ghcr.io/trading-model/<svc>:$tag.
	# The source name is dropped once tagged: left over, it would overwrite the direct build of the next release.
	tag_built() { ! docker image inspect "$1" >/dev/null 2>&1 || { docker tag "$1" "$2" && docker rmi "$1" >/dev/null; }; }
	tag_built "${COMPOSE_PROJECT_NAME}-spire-bootstrap" "ghcr.io/trading-model/spire-tools:$tag"
	for svc in $services; do
		tag_built "${COMPOSE_PROJECT_NAME}-${svc}" "ghcr.io/trading-model/${svc}:$tag"
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
	# Only what N-1 still runs: a retired service it predates or already dropped is not built.
	local svc kept=""
	for svc in $RETIRED; do
		if grep -q "^  $svc:" "$PREVIOUS/docker-compose.yml"; then kept="$kept $svc"; fi
	done
	RETIRED="${kept# }"
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
	local node="${CLUSTER}-control-plane" img ref digest n
	for img in $IMAGES${2:+ $2}; do
		ref="ghcr.io/trading-model/$img"
		digest="$(docker exec "$node" ctr -n k8s.io images ls "name==$ref:$1" | awk 'NR == 2 {print $3}')"
		[ -n "$digest" ] || {
			log "$ref:$1 is not in the kind node"
			return 1
		}
		for n in $("$KIND" get nodes --name "$CLUSTER"); do # every node: a pod may land on a worker (KIND_NODES=3)
			docker exec "$n" ctr -n k8s.io images tag --force "$ref:$1" "$ref@$digest" >/dev/null
		done
		echo "$img $digest"
	done
}

# Pulls the release images of tag $PREVIOUS_REF from $KIND_PREVIOUS_REGISTRY by
# digest, each verified as signed by release.yml (as deploy.yml does), as
# ghcr.io/trading-model/<image>:previous. An image the tag predates (decided on
# its checkout, never on a registry error) gets a stand-in built from this
# checkout, as build_images does: N-1 manifests never deploy it.
pull_previous_images() {
	local img ref digest repo="${GITHUB_REPOSITORY:-docteur-turboss/trading-model}" missing=""
	local released=" $(sed -n 's/^ *- \(.*\)\.yaml$/\1/p' "$PREVIOUS/deploy/k8s/services/kustomization.yaml" | tr '\n' ' ') spire-tools backup-tools "
	[ ! -f "$PREVIOUS/deploy/migrate/Dockerfile" ] || released="${released}db-migrate "
	for img in $IMAGES $RETIRED; do
		[[ "$released" == *" $img "* ]] || {
			missing="$missing $img"
			continue
		}
		ref="$KIND_PREVIOUS_REGISTRY/$img"
		digest="$(docker buildx imagetools inspect "$ref:${PREVIOUS_REF#v}" --format '{{.Manifest.Digest}}')"
		cosign verify "$ref@$digest" --certificate-oidc-issuer https://token.actions.githubusercontent.com \
			--certificate-identity-regexp "^https://github\.com/${repo}/\.github/workflows/release\.yml@refs/tags/v" >/dev/null || {
			log "$ref@$digest: no valid release.yml signature"
			return 1
		}
		retry 3 docker pull -q "$ref@$digest" >/dev/null
		docker tag "$ref@$digest" "ghcr.io/trading-model/$img:previous"
	done
	[ -n "$missing" ] || return 0
	log "not in $PREVIOUS_REF, unsigned stand-in built from this checkout:$missing"
	if [[ "$missing" == *" db-migrate"* ]]; then
		retry 3 docker build -q -t ghcr.io/trading-model/db-migrate:previous -f "$ROOT/deploy/migrate/Dockerfile" "$ROOT"
		missing="${missing/ db-migrate/}"
	fi
	export IMAGE_TAG=previous
	# shellcheck disable=SC2086
	[ -z "$missing" ] || retry 3 docker compose -f "$ROOT/docker-compose.yml" -f "$ROOT/docker-compose.build.yml" build $missing
}

images() {
	local started=$SECONDS img
	previous_checkout
	if [ -n "${KIND_PREVIOUS_REGISTRY:-}" ]; then
		log "pulling the signed images of release N-1 from $KIND_PREVIOUS_REGISTRY"
		pull_previous_images
	else
		log "building the images of release N-1"
		build_images "$PREVIOUS" previous "$RETIRED"
	fi
	# Same sources build the same image: a label keeps N-1 digests apart from N.
	for img in $IMAGES $RETIRED; do
		echo "FROM ghcr.io/trading-model/$img:previous" |
			docker build -q --label trading-model.kind-release=previous -t "ghcr.io/trading-model/$img:previous" - >/dev/null
	done
	log "  release N-1 images built in $((SECONDS - started)) s"
	log "building the images of release N (this checkout)"
	build_images "$ROOT" latest
	local images="" ; for img in $RETIRED; do images="$images ghcr.io/trading-model/$img:previous"; done
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
	node_digests previous "$RETIRED" >"$WORK/digests-previous"
	node_digests latest >"$WORK/digests-current"
}

cluster() {
	if "$KIND" get clusters 2>/dev/null | grep -qx "$CLUSTER"; then
		log "cluster $CLUSTER already exists"
	else
		# A failed create (kindest/node pull) leaves a half-made cluster: drop it between attempts.
		# KIND_NODES=3: the group that proves the production topology (tests/k8s/kind-three-nodes.yaml, #2657).
		local config=()
		[ "${KIND_NODES:-1}" != 3 ] || { config=(--config "$ROOT/tests/k8s/kind-three-nodes.yaml"); mkdir -p /tmp/kind-rwx; }
		retry 3 bash -c '"$0" delete cluster --name "$1" >/dev/null 2>&1; "$0" create cluster --name "$1" --wait 180s "${@:2}"' "$KIND" "$CLUSTER" "${config[@]}"
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
	if out="$($as_cluster label namespace "$NS" pod-security.kubernetes.io/enforce=privileged --overwrite 2>&1)" || ! grep -qi forbidden <<<"$out"; then
		log "deploy-cluster could relabel the application namespace (or failed other than Forbidden): $out"
		return 1
	fi
	if out="$($as_cluster -n trading-model-node create -f - 2>&1 <<<'{"apiVersion":"apps/v1","kind":"DaemonSet","metadata":{"name":"rogue"},"spec":{"selector":{"matchLabels":{"a":"b"}},"template":{"metadata":{"labels":{"a":"b"}},"spec":{"containers":[{"name":"c","image":"busybox"}]}}}}')" || ! grep -qi forbidden <<<"$out"; then
		log "deploy-cluster could create a DaemonSet in trading-model-node (or failed other than Forbidden): $out"
		return 1
	fi
	log "  deploy-cluster: self-bind, namespace relabel and DaemonSet create Forbidden, no nodes/proxy; deploy-app: no Secret in kube-system"
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
	# dlq:write kept in N: N-1 tokens carry it, N must start with them and ignore it (#1241).
	local scopes="read+dlq:write+risk:admin"
	[ "$1" = "$ROOT" ] || scopes="read+dlq:write"
	CI_RENDER_SCOPES="$scopes" node "$ROOT/tests/k8s/ci-render.mjs" <"$3.raw" >"$3" || return 1
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
		$K -n "$NS" exec "$(mongo_primary "$label")" -- sh -c 'mongosh --quiet --tls --tlsCAFile /keyfile/ca.crt --eval "
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
	# rolling restart). Margins kept for slower runners.
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
# through edge-proxy to trader-trainer (Lease handover,
# ADR-0067) and financial-scraper (PROBE_ROUTES) and market candles are
# written. Fails above
# PROBE_MAX_FAILURES (default 0: a release must not drop a request) failed
# requests or when a candle of BTCUSDT is missing (gap above one interval,
# 1 minute: the stub serves 1m klines) during the window.
release_under_probe() {
	local rc=0
	rm -rf "$WORK/probe-logs"
	mkdir -p "$WORK/probe-logs"
	_release_under_probe || rc=$?
	[ "$rc" = 0 ] || probe_failure_report
	return "$rc"
}

# Failed responses (route, status, body) and the gateway / scraper logs of the
# window, followed per pod from before `release`: the rollout deletes the N-1
# pods, after which `kubectl logs` can no longer read them.
probe_failure_report() {
	local f
	echo "--- failed probe responses"
	sort "$WORK/probe.count.err" 2>/dev/null | uniq -c | head -20
	for f in "$WORK"/probe-logs/*.log; do
		[ -e "$f" ] || continue
		echo "--- log $(basename "$f")"
		cat "$f"
	done
}

_release_under_probe() {
	local stop="$WORK/probe.stop" out="$WORK/probe.count" max="${PROBE_MAX_FAILURES:-0}" pid gap_pid start rc=0 began svc pod
	local requests failures row candles gap need
	rm -f "$stop" "$out" "$out.err"
	echo "0 0" >"$out"
	probe_wait_ready || return 1
	# After the wait: the candle window below must not include it.
	began=$SECONDS
	for svc in api-gateway financial-scraper; do
		for pod in $($K -n "$NS" get pods -l "app.kubernetes.io/component=$svc" -o name); do
			$K -n "$NS" logs -f "$pod" --all-containers --prefix >"$WORK/probe-logs/${pod#pod/}.log" 2>&1 &
		done
	done
	probe_availability "$stop" "$out" 2> >(tee "$out.err" >&2) &
	pid=$!
	# A failing command under errexit must not leave the probe or the log
	# followers running.
	# shellcheck disable=SC2064
	trap "touch '$stop'; kill $pid \$(jobs -p) 2>/dev/null || true; trap - RETURN" RETURN
	start="$(mysql_root "SELECT UTC_TIMESTAMP(3)" | tr -d '\r')"
	[ -n "$start" ] || {
		log "could not read the window start from MySQL"
		return 1
	}
	# Recreate pause (issue #2849): seconds (2 s steps) risk-execution has no ready pod.
	(
		down=0
		while [ ! -e "$stop" ]; do
			[ "$($K -n "$NS" get deployment risk-execution -o jsonpath='{.status.readyReplicas}' 2>/dev/null)" -ge 1 ] 2>/dev/null || down=$((down + 2))
			sleep 2
		done
		echo "$down" >"$WORK/risk-down"
	) &
	gap_pid=$!
	release "$WORK/digests-current" || rc=$?
	touch "$stop"
	wait "$pid" || true
	wait "$gap_pid" || true
	log "  risk-execution had no ready pod for about $(cat "$WORK/risk-down" 2>/dev/null || echo '?') s during the upgrade (Recreate)"
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
		# 000 is a timeout or refused connection (a route without ready pod); 4xx/5xx come from the route itself.
		log "the upgrade dropped $failures request(s) (threshold $max); status codes: $(sed -n 's/^probe: .* answered //p' "$out.err" | sort | uniq -c | tr -s ' 
' ' ')"
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
	# Its ::error:: is expected: printed as plain text, or the job's first annotation misleads.
	if release "$WORK/digests-broken" 30s 2>&1 | sed -u 's/^::error::/expected failure: /'; then
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
	local missing
	missing="$(comm -23 <(echo "$before_migrations" | sort) <(applied_migrations | sort))"
	[ -z "$missing" ] || {
		log "migrations of release N-1 no longer applied after the rollback: $missing"
		return 1
	}
	SMOKE_SKIP="model-evaluator risk-execution decision-consumer" deploy_script smoke-test # new in N: deleted by the rollback
	log "  rollback: every Deployment back on its N-1 pod template (image digests, $marked N-1 ConfigMaps), N-1 migrations applied"

	log "migrate-down 1, then the migrations again"
	local applied last
	applied="$(applied_migrations)"
	last="$(echo "$applied" | tail -1 | cut -f1)"
	deploy_script migrate-down 1
	[ "$(applied_migrations)" = "$(echo "$applied" | sed '$d')" ] || {
		log "migrate-down 1 did not undo exactly $last: $(applied_migrations | cut -f1 | tr '\n' ' ')"
		return 1
	}
	migrations "$ROOT"
	[ "$(applied_migrations)" = "$applied" ] || {
		log "the migrations after migrate-down 1 differ from before: $(applied_migrations | cut -f1 | tr '\n' ' ')"
		return 1
	}
	log "  $last rolled back and applied again, same checksums"

	# Issue #2377: the widening of market_trades.id (012) runs inside the probed window,
	# on a table of staging size, back on INT as release N-1 left it.
	log "market_trades: id back to INT, 3 M rows, 012 pending again for the upgrade under probe"
	local chunk widen="012_widen_market_trades_id_online"
	mysql_root "DELETE FROM financial_scraper._migrations WHERE id = '$widen'; ALTER TABLE financial_scraper.market_trades MODIFY COLUMN id INT NOT NULL AUTO_INCREMENT" || return 1
	for chunk in 0 1 2 3 4 5; do
		mysql_root "INSERT /*+ SET_VAR(cte_max_recursion_depth = 500000) */ INTO financial_scraper.market_trades (symbol, market, source, trade_id, price, quantity, side, timestamp) WITH RECURSIVE n (i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 500000) SELECT 'FILLUSDT', 'crypto', 'binance', $chunk * 500000 + i, 1, 1, 'buy', UTC_TIMESTAMP(3) - INTERVAL 1 DAY FROM n" || return 1
	done

	# As staging-local (issue #2882): redis-0 held on N-1 by `partition: 1`; redis-last must
	# bring it the users of N through Sentinel failovers, without losing a journal entry.
	$K -n "$NS" patch statefulset redis -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":1}}}}'
	local journal_before journal_after
	journal_before="$(journal_len)" || return 1
	log "upgrade N-1 → N, availability probed through edge-proxy"
	verify_collection_gap "upgrade N-1 → N" release_under_probe || {
		log "the upgrade to release N failed, dropped requests, or stopped the market data 30 s or more"
		return 1
	}
	[ "$($K -n "$NS" get pod redis-0 -o jsonpath='{.metadata.labels.controller-revision-hash}')" = \
		"$($K -n "$NS" get statefulset redis -o jsonpath='{.status.updateRevision}')" ] &&
		journal_after="$(journal_len)" && [ "$journal_after" -ge "$journal_before" ] &&
		wait_for 300 '[ "$(risk_outbox_len)" = 0 ]' || {
		log "partitioned redis-0 not on the template of N, journal entries lost (${journal_after:-?} after $journal_before) or risk-execution outbox not drained"
		return 1
	}
	log "  partitioned redis-0 on the template of N, journal $journal_before entries before, $journal_after after, risk-execution outbox empty"
	local widened
	widened="$(mysql_root "SELECT CONCAT(COLUMN_TYPE, ' ', (SELECT COUNT(*) FROM financial_scraper.market_trades WHERE symbol = 'FILLUSDT'), ' ', (SELECT COUNT(*) FROM financial_scraper._migrations WHERE id = '$widen')) FROM information_schema.columns WHERE table_schema = 'financial_scraper' AND table_name = 'market_trades' AND column_name = 'id'" | tr -d '\r')"
	[ "$widened" = "bigint unsigned 3000000 1" ] || {
		log "market_trades after $widen under the probe: '$widened', expected 'bigint unsigned 3000000 1'"
		return 1
	}
	# Issue #2057 (ADR-0088): the db-index-build Job reaches MySQL (NetworkPolicy) and builds the indexes; deploy does not wait for it.
	log "db-index-build: idx_*_symbol_ts built, idx_*_symbol dropped"
	wait_for 600 '[ "$(symbol_ts_indexes)" = "3 0" ]' || {
		$K -n "$NS" logs job/db-index-build --tail=30 || true
		log "db-index-build left '$(symbol_ts_indexes)' (built, old) instead of '3 0'"
		return 1
	}
	log "collector handover on release N: rolling restart, the Lease goes to the new pod (ADR-0057)"
	verify_collection_gap "restart N → N" collector_handover || return 1
	# The restore drill dumps market_trades: back to the collector's rows only.
	mysql_root "DELETE FROM financial_scraper.market_trades WHERE symbol = 'FILLUSDT'" || return 1
	# Every exporter reaches its database, so neither MySQLDown nor RedisDown
	# (critical, verify-release rolls back on them) fires (issue #698).
	# mongodb_up = 1 means the `exporter` user (clusterMonitor, ADR-0067) exists on
	# every member: the Jobs mongo-*-users ran after the transition step.
	log "exporters up after the upgrade: min(mysql_up) = min(redis_up) = min(mongodb_up) = 1, no MySQLDown / RedisDown / MongoDBDown"
	wait_for 180 '[ "$(prometheus_value "min(mysql_up)")" = 1 ] && [ "$(prometheus_value "min(redis_up)")" = 1 ] &&
		[ "$(prometheus_value "min(mongodb_up)")" = 1 ] &&
		[ -z "$(prometheus_value "ALERTS{alertname=~\"MySQLDown|RedisDown|MongoDBDown\"}")" ]' || {
		log "  min(mysql_up)=$(prometheus_value 'min(mysql_up)') min(redis_up)=$(prometheus_value 'min(redis_up)') min(mongodb_up)=$(prometheus_value 'min(mongodb_up)')"
		return 1
	}
	if [ "${KIND_FULL_ROLLBACK:-1}" = 0 ]; then
		log "full rollback skipped (KIND_FULL_ROLLBACK=0)"
	else
		full_rollback || return 1
	fi
	log "OK: upgrade N-1 → N, forced failure and rollback, migrate-down 1 and up in $((SECONDS - started)) s"
	[ -z "${GITHUB_STEP_SUMMARY:-}" ] ||
		echo "Upgrade N-1 → N with forced failure and rollback: $((SECONDS - started)) s" >>"$GITHUB_STEP_SUMMARY"
}

# deploy.yml with rollback=true (issue #3021), from release N: the schema guard refuses a schema
# N-1 does not know, then (after an explicit migrate-down, as the runbook says) N-1 is applied
# whole with no migration, and NetworkPolicies and CronJobs are N-1's. Ends back on N.
# wait, smoke-test and forget come from N-1's checkout, as deploy.yml runs them from the N-1 tag:
# N's smoke-test probes from api-gateway, which N-1's NetworkPolicies may refuse, and N's forget
# deletes discovery-server, N-1's probe point (issue #3070). N-1's smoke-test has no probe
# timeout before #3070: bounded here, so a silent drop fails in 5 min, not at the job timeout.
full_rollback() {
	local drift unknown migrations_before out
	log "full rollback N → N-1 (deploy.yml rollback=true)"
	mysql_root "INSERT INTO financial_scraper._migrations (id, name, checksum) VALUES ('999_unknown_to_n1', 'x', 'x')" || return 1
	if release_script schema-check "$NS" "$PREVIOUS/scripts/migrations" 2>/dev/null; then
		log "schema-check accepted a live schema newer than N-1"
		return 1
	fi
	mysql_root "DELETE FROM financial_scraper._migrations WHERE id = '999_unknown_to_n1'" || return 1
	unknown="$(comm -23 <(applied_migrations | cut -f1 | sort) <(ls "$PREVIOUS/scripts/migrations" | sed -n 's/\.up\.sql$//p' | sort) | wc -l)"
	[ "$unknown" = 0 ] || deploy_script migrate-down "$unknown"
	release_script schema-check "$NS" "$PREVIOUS/scripts/migrations" || return 1
	migrations_before="$(applied_migrations)"
	out="$WORK/full-rollback.log"
	{
		release_script record "$NS" "$WORK/revisions" &&
			release_script release-replicas "$NS" &&
			# N-1 predates podManagementPolicy: Parallel (immutable): as release-replicas does for the other way round.
			{ [ "$($K get statefulset redis -n "$NS" -o jsonpath='{.spec.podManagementPolicy}')" != Parallel ] || [ -n "$(grep -s podManagementPolicy "$PREVIOUS/deploy/k8s/infra/redis.yaml")" ] || $K delete statefulset redis -n "$NS" --cascade=orphan --timeout=120s; } &&
			apply_release "$PREVIOUS" "$WORK/digests-previous" &&
			release_script prune-network-policies "$NS" <"$WORK/app.yaml" &&
			(cd "$PREVIOUS" && use_kube && bash deploy/k8s/scripts/deploy-release.sh wait "$NS") &&
			release_script redis-last "$NS" <"$WORK/app.yaml" &&
			(cd "$PREVIOUS" && use_kube && K8S_NAMESPACE="$NS" SMOKE_SKIP="model-evaluator risk-execution decision-consumer" timeout 300 bash deploy/k8s/scripts/deploy-k8s.sh smoke-test ||
				{ [ $? != 124 ] || log "N-1 smoke test still running after 300 s: stopped"; false; }) &&
			(cd "$PREVIOUS" && use_kube && bash deploy/k8s/scripts/deploy-release.sh forget "$NS")
	} 2>&1 | tee "$out"
	[ "${PIPESTATUS[0]}" = 0 ] || return 1
	! grep -qi 'db-migrate\|migrations applied' "$out" && [ "$(applied_migrations)" = "$migrations_before" ] || {
		log "the full rollback ran a migration"
		return 1
	}
	# $WORK/app.yaml is N-1's render: any NetworkPolicy or CronJob still differing from it stayed on N.
	drift="$($K diff -f "$WORK/app.yaml" 2>/dev/null | grep -E '^diff .*(NetworkPolicy|CronJob).' || true)"
	[ -z "$drift" ] || {
		log "NetworkPolicies or CronJobs not back on N-1: $drift"
		return 1
	}
	log "  N-1 applied whole, no migration run; back to N"
	release "$WORK/digests-current"
}

# MySQL's clock (UTC, millisecond), the reference of collection_gap.
mysql_now() {
	mysql_root "SELECT UTC_TIMESTAMP(3)"
}

# Longest interval in seconds between two consecutive BTCUSDT order books (one
# per scrape cycle, stamped with the collector's fetch time) from `$1` to the
# newest one; empty while fewer than two. The collector handover of a rollout
# (ADR-0057) must keep it under COLLECTION_MAX_GAP_SECONDS.
collection_gap() {
	mysql_root "SELECT MAX(TIMESTAMPDIFF(MICROSECOND, prev, ts)) / 1000000 FROM (SELECT timestamp AS ts, LAG(timestamp) OVER (ORDER BY timestamp) AS prev FROM financial_scraper.market_order_books WHERE symbol = 'BTCUSDT' AND timestamp >= '$1') AS cycles"
}

# Runs the rollout command `$2...` of the collector and fails when the market
# data gap across it reaches 30 s (issue #702: the scrape runs every 10 s in
# CI, see ci-render.mjs). `$1` names the rollout in the log.
verify_collection_gap() {
	local label="$1" since rolled gap
	shift
	since="$(mysql_now)"
	"$@" || return 1
	# The old pod gone, it drained and released the Lease: from now on only the new one collects.
	wait_for 120 '[ "$($K -n "$NS" get pods -l app.kubernetes.io/component=financial-scraper-collector -o name | wc -l)" -eq 1 ]' || {
		log "  $label: the old collector pod is still there"
		return 1
	}
	rolled="$(mysql_now)"
	# Two cycles of the new pod after the rollout: the gap is fully measured.
	wait_for 120 "[ \"\$(mysql_root \"SELECT COUNT(*) FROM financial_scraper.market_order_books WHERE symbol = 'BTCUSDT' AND timestamp > '$rolled'\")\" -ge 2 ]" || {
		log "  $label: no market data after the rollout"
		return 1
	}
	gap="$(collection_gap "$since")"
	log "  $label: longest market data gap ${gap} s (limit 30 s)"
	[ -z "${GITHUB_STEP_SUMMARY:-}" ] || echo "Collector handover ($label): longest market data gap ${gap} s" >>"$GITHUB_STEP_SUMMARY"
	awk -v g="${gap:-999}" 'BEGIN { exit !(g < 30) }'
}

# The holder of the collector Lease (ADR-0057) restarted as a release does:
# the old pod drains and releases, the new one takes the Lease over.
collector_handover() {
	$K -n "$NS" rollout restart deployment/financial-scraper-collector &&
		$K -n "$NS" rollout status deployment/financial-scraper-collector --timeout=300s
}

mysql_count() {
	$K -n "$NS" exec mysql-0 -- sh -c \
		"mysql -uroot -p\"\$MYSQL_ROOT_PASSWORD\" -N financial_scraper -e 'SELECT COUNT(*) FROM $1'" 2>/dev/null
}

# Value of the first series of the instant PromQL query `$1`, empty when none.
prometheus_value() {
	$K -n "$NS" exec prometheus-0 -c prometheus -- \
		wget -qO- "http://localhost:9090/api/v1/query?query=$(jq -rn --arg q "$1" '$q | @uri')" |
		jq -r '.data.result[0].value[1] // empty'
}

# MySQL accounts named `exporter` (ADR-0056, created by db-migrate-user).
exporter_users() {
	mysql_root "SELECT COUNT(*) FROM mysql.user WHERE user='exporter'"
}

# Every configured job must have active targets, all up: a scrape pool Prometheus
# failed to create (missing tls_config file at startup) has no target at all.
prometheus_targets_down() {
	local config
	config="$($K -n "$NS" exec prometheus-0 -c prometheus -- wget -qO- 'http://localhost:9090/api/v1/status/config')" || return 1
	$K -n "$NS" exec prometheus-0 -c prometheus -- 		wget -qO- 'http://localhost:9090/api/v1/targets?state=active' |
		CONFIG="$config" node -e 'const t=JSON.parse(require("fs").readFileSync(0,"utf8")).data.activeTargets;
			const jobs=[...JSON.parse(process.env.CONFIG).data.yaml.matchAll(/job_name: *(\S+)/g)].map((m)=>m[1].replace(/^["\x27]|["\x27]$/g,""));
			const seen=new Set(t.map((x)=>x.labels.job));
			const missing=jobs.filter((j)=>!seen.has(j));
			const down=t.filter((x)=>x.health!=="up");
			for (const j of missing) console.error(`${j}: no active target (scrape pool not created?)`);
			for (const x of down) console.error(`${x.labels.job}: ${x.health} ${x.lastError}`);
			process.exit(jobs.length>0 && missing.length===0 && down.length===0 ? 0 : 1)'
}

# Groups of checks, one CI job each (ci.yml, matrix `group`): each runs on a
# freshly deployed and upgraded stack, so a group never depends on another one.
verify() {
	verify_network
	verify_observability
	verify_backup_group
	log "OK: the staging overlay works on Kubernetes"
}

verify_network() {
	log "market data reaches MySQL (stub → scraper → MySQL)"
	wait_for 300 '[ "$(mysql_count market_candles)" -gt 0 ]'
	log "  candles=$(mysql_count market_candles) trades=$(mysql_count market_trades)"

	verify_egress
	verify_mongo_ingress
	verify_db_ingress
	verify_mysql_tls
	verify_redis_tls
	verify_bus
	[ "${KIND_NODES:-1}" != 3 ] || verify_ha

	log "external path: edge-proxy → api-gateway → trader-trainer"
	$K -n "$NS" port-forward svc/edge-proxy 18449:8080 >/dev/null 2>&1 &
	local forward=$!
	trap 'kill $forward 2>/dev/null || true' RETURN
	wait_for 30 'curl -s -o /dev/null http://localhost:18449/'
	local url="http://localhost:18449/v1/trader-trainer/training-status"
	[ "$(curl -s -o /dev/null -w '%{http_code}' "$url")" = "401" ] || {
		log "a request without API key was not rejected"
		return 1
	}
	wait_for 120 "curl -sf -o /dev/null -H 'x-api-key: $API_KEY' $url"
	log "  training status: $(curl -s -H "x-api-key: $API_KEY" "$url")"
}

# Production topology on 3 nodes (KIND_NODES=3, ci-render.mjs CI_RENDER_HA): Redis master + 2
# replicas on 3 nodes, a journal write held by a replica (WAIT 1, JOURNAL_MIN_REPLICAS=1), a
# Sentinel failover, a rolling restart of a 3-replica Deployment that never drops below 2 ready.
verify_ha() {
	log "Redis HA: 3 pods on 3 nodes, WAIT 1, Sentinel failover"
	# After the upgrade and rollback drills (Redis at 1 pod there): release N again with the HA patches of ci-render.mjs.
	local redis="$K -n $NS exec redis-sentinel-0 -c sentinel --" tls="--tls --cacert /etc/redis-tls/ca.crt --sni redis"
	sentinel() {
		$redis sh -c "REDISCLI_AUTH=\$REDIS_INTERNAL_PASSWORD redis-cli $tls -p 26380 --raw SENTINEL $*"
	}
	# Scale first, without a template change: the HA render rolls redis-0 (the master) seconds after the
	# replicas are Ready, before the sentinels know them and each other, and no failover can follow.
	$K -n "$NS" scale statefulset/redis statefulset/redis-sentinel --replicas=3 || return 1
	$K -n "$NS" rollout status statefulset/redis --timeout=300s || return 1
	$K -n "$NS" rollout status statefulset/redis-sentinel --timeout=300s || return 1
	wait_for 120 '[ "$(sentinel replicas mymaster | grep -c "^ip$")" -ge 2 ] && sentinel ckquorum mymaster | grep -q "3 usable"' || return 1
	CI_RENDER_HA=1 apply_release "$ROOT" "$WORK/digests-current" || return 1
	release_script redis-last "$NS" <"$WORK/app.yaml" || {
		$K -n "$NS" get pod,pvc -o wide || true
		$K -n "$NS" get events --field-selector type=Warning --sort-by=.lastTimestamp | tail -20 || true
		$K -n "$NS" logs redis-0 -c redis --tail=30 || true
		$K -n "$NS" logs redis-0 -c redis --previous --tail=30 || true
		for s in 0 1 2; do $K -n "$NS" logs "redis-sentinel-$s" -c sentinel --tail=25 || true; done
		sentinel masters || true
		sentinel replicas mymaster || true
		return 1
	}
	[ "$($K -n "$NS" get pod -l app.kubernetes.io/component=redis -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' | sort -u | wc -l)" -eq 3 ] || {
		log "the 3 Redis pods are not on 3 nodes"
		return 1
	}
	master() {
		local ip
		ip="$($redis sh -c "REDISCLI_AUTH=\$REDIS_INTERNAL_PASSWORD redis-cli $tls -p 26380 --raw SENTINEL get-master-addr-by-name mymaster" | head -n 1)"
		$K -n "$NS" get pod -l app.kubernetes.io/component=redis -o jsonpath="{range .items[?(@.status.podIP==\"$ip\")]}{.metadata.name}{end}"
	}
	local old new
	old="$(master)"
	[ -n "$old" ] || { log "Sentinel names no Redis master"; return 1; }
	# message-manager's ACL user: HSET under its prefix, then the replicas that hold it.
	# shortcut: that user is kept one release only (redis-ha.sh, expand/contract); move the probe to a bus user when it goes.
	[ "$($K -n "$NS" exec "$old" -c redis -- sh -c "c() { REDISCLI_AUTH=\$REDIS_MESSAGE_MANAGER_PASSWORD redis-cli $tls -p 6380 --user message-manager --raw \"\$@\"; }; c HSET trading-model:message-manager:ha-probe a 1 >/dev/null && c WAIT 1 5000")" -ge 1 ] || {
		log "WAIT 1 on $old: no replica acknowledged"
		return 1
	}
	$K -n "$NS" delete pod "$old" --wait=false
	wait_for 180 '[ -n "$(master)" ] && [ "$(master)" != "'"$old"'" ]' || { log "Sentinel did not elect another master than $old"; return 1; }
	new="$(master)"
	$K -n "$NS" rollout status statefulset/redis --timeout=300s
	log "  master $old -> $new, 3 pods back"

	# api-gateway: HPA in production (no HPA in CI, so back to 1 replica after), spread DoNotSchedule on 3 nodes.
	log "rolling restart of api-gateway (3 replicas): at least 2 ready throughout"
	$K -n "$NS" scale deployment/api-gateway --replicas=3
	$K -n "$NS" rollout status deployment/api-gateway --timeout=300s
	$K -n "$NS" rollout restart deployment/api-gateway
	local low=3 ready
	until $K -n "$NS" rollout status deployment/api-gateway --timeout=5s >/dev/null 2>&1; do
		ready="$($K -n "$NS" get deployment api-gateway -o jsonpath='{.status.readyReplicas}')"
		[ "${ready:-0}" -ge "$low" ] || low="${ready:-0}"
	done
	[ "$low" -ge 2 ] || { log "api-gateway fell to $low ready pods during the rolling restart"; return 1; }
	log "  never below $low ready pods"
	$K -n "$NS" scale deployment/api-gateway --replicas=1
}

verify_observability() {
	verify_traces

	log "Prometheus scrapes every target over mTLS (SVID)"
	wait_for 180 prometheus_targets_down

	log "Loki receives the pod logs (promtail)"
	wait_for 180 "$K -n $NS get --raw /api/v1/namespaces/$NS/services/loki:http/proxy/loki/api/v1/label/component/values | grep -q audit-logger"

	verify_alerts
	verify_release
	verify_canary
}

# Restore drill (skipped on PRs that touch no backup code, SKIP_BACKUP_DRILL=true),
# then the identity check, which stops mysql-0 and so runs last.
verify_backup_group() {
	if [ "${SKIP_BACKUP_DRILL:-}" = "true" ]; then
		log "restore drill skipped (SKIP_BACKUP_DRILL=true)"
	else
		verify_backup
	fi
	verify_identity_without_mysql
}

# Issue #802 (ADR-0065): with every MySQL pod gone (mysql-0 included), the
# SPIRE server restarts on its SQLite datastore and a restarted application
# pod still gets an SVID. MySQL is brought back afterwards.
verify_identity_without_mysql() {
	local mysql_replicas
	mysql_replicas="$($K -n "$NS" get statefulset mysql -o jsonpath='{.spec.replicas}')"
	log "SVIDs without MySQL: statefulset mysql scaled to 0 (was $mysql_replicas)"
	$K -n "$NS" scale statefulset mysql --replicas=0
	$K -n "$NS" wait --for=delete pod mysql-0 --timeout=300s
	$K -n "$NS" rollout restart deployment/spire-server
	$K -n "$NS" rollout status deployment/spire-server --timeout=300s
	wait_for 60 "$K -n $NS exec deployment/spire-server -c spire-server -- /opt/spire/bin/spire-server healthcheck -socketPath /run/spire/server-sockets/api.sock"
	# A datastore read: the entries are served from SQLite, not MySQL.
	wait_for 60 "$K -n $NS exec deployment/spire-server -c spire-server -- /opt/spire/bin/spire-server entry count -socketPath /run/spire/server-sockets/api.sock | grep -Eq '[1-9]'"
	log "  SPIRE server healthy without MySQL"
	$K -n "$NS" rollout restart deployment/audit-logger
	$K -n "$NS" rollout status deployment/audit-logger --timeout=300s
	local pod pods
	# Pods of the old ReplicaSet may still be terminating: skipped. Captured
	# first so a kubectl failure stops the step (set -e) instead of an empty loop.
	pods="$($K -n "$NS" get pod -l app.kubernetes.io/component=audit-logger -o go-template --template '{{range .items}}{{if not .metadata.deletionTimestamp}}{{.metadata.name}}{{"\n"}}{{end}}{{end}}')"
	[ -n "$pods" ] || {
		log "no audit-logger pod found"
		return 1
	}
	for pod in $pods; do
		$K -n "$NS" exec "$pod" -c audit-logger -- test -s /run/spire/svid/svid.pem || {
			log "$pod restarted without MySQL has no SVID"
			return 1
		}
		log "  $pod has its SVID"
	done
	log "  restarted audit-logger pods got their SVID"
	$K -n "$NS" scale statefulset mysql --replicas="$mysql_replicas"
	$K -n "$NS" rollout status statefulset/mysql --timeout=600s
	log "  MySQL back ($mysql_replicas replicas)"
}

# Requests through edge-proxy must leave in Jaeger a trace that spans
# api-gateway and the service it called (issue #599: telemetry started after
# Express recorded nothing). Jaeger is read through a port-forward, which the
# NetworkPolicies do not filter.
traces_span_services() {
	# The trace ID is the one verify_traces sends in `traceparent`: looking it up
	# tells a lost propagation (api-gateway spans only) from an absent trace.
	curl -sf "http://localhost:18686/api/traces/$TRACE_ID" |
		node -e '
			const [trace] = JSON.parse(require("fs").readFileSync(0, "utf8")).data ?? [];
			const names = [...new Set(Object.values(trace?.processes ?? {}).map((p) => p.serviceName))];
			console.error(`trace=${process.argv[1]} widest=${names.join(",")}`);
			process.exit(names.includes("api-gateway") && names.includes("trader-trainer") ? 0 : 1)' "$TRACE_ID"
}

verify_traces() {
	log "a request through edge-proxy gives a Jaeger trace spanning api-gateway and trader-trainer"
	$K -n "$NS" port-forward svc/edge-proxy 18451:8080 >/dev/null 2>&1 &
	local edge=$!
	$K -n "$NS" port-forward svc/jaeger 18686:16686 >/dev/null 2>&1 &
	local jaeger=$!
	local result=0 codes=""
	TRACE_ID="$(od -An -N16 -tx1 /dev/urandom | tr -d ' \n')"
	wait_for 30 'curl -s -o /dev/null http://localhost:18451/ && curl -s -o /dev/null http://localhost:18686/' || result=1
	# ci-render.mjs samples 100 % and the sent traceparent is sampled: all requests join one trace.
	if [ "$result" = 0 ]; then
		codes="$(for _ in $(seq 30); do
			curl -s -o /dev/null -w '%{http_code}\n' -H "x-api-key: $API_KEY" \
				-H "traceparent: 00-$TRACE_ID-00f067aa0ba902b7-01" \
				http://localhost:18451/v1/trader-trainer/training-status
		done | sort | uniq -c | tr '\n' ' ')"
	fi
	# Batch exporter (5 s), tail_sampling decision_wait (10 s) then collector batch (1 s): a few polls at most.
	if [ "$result" = 0 ] && wait_for 120 traces_span_services; then
		log "  $(traces_span_services 2>&1)"
	else
		traces_span_services || true
		log "  http codes: ${codes:-none}"
		log "  trader-trainer traces in Jaeger: $(curl -s "http://localhost:18686/api/traces?service=trader-trainer&limit=50&lookback=1h" | node -e 'try{console.log((JSON.parse(require("fs").readFileSync(0,"utf8")).data??[]).length)}catch{console.log("unreadable")}')"
		result=1
	fi
	# No RETURN trap: it would replace the one of verify (traps are global).
	kill "$edge" "$jaeger" 2>/dev/null || true
	return "$result"
}

# ci-render.mjs drops every internet egress rule: kind must enforce the
# NetworkPolicies for that to block anything (kindnet does since kind v0.24).
# Control: a pod of a namespace without policy reaches the same URL.
verify_egress() {
	local url="https://example.com"
	log "internet egress: refused to the collector, allowed without policy"
	retry 3 $K run egress-control -n default --rm -i --restart=Never --quiet \
		--image="$CURL_IMAGE" -- curl -s -o /dev/null -m 10 "$url" || {
		log "  the control pod has no internet: the check proves nothing"
		return 1
	}
	if $K -n "$NS" exec deploy/financial-scraper-collector -c financial-scraper-collector -- \
		node -e "fetch('$url',{signal:AbortSignal.timeout(5000)}).then(()=>process.exit(0),()=>process.exit(1))"; then
		log "  the collector reached $url: NetworkPolicy not enforced"
		return 1
	fi
}

# mongosh ping of `$3` from a throwaway pod `$1` with labels `$2` (none when
# empty). Restricted Pod Security: the security context is spelled out.
mongo_ping() {
	local img uri
	img="$(grep -m1 -oE 'mongo(:[^@ ]+)?@sha256:[0-9a-f]+' "$ROOT/deploy/k8s/infra/mongo-audit.yaml")"
	# Probe only checks reachability under NetworkPolicy; the CA is not mounted in this pod.
	uri="mongodb://$3:27017/?directConnection=true&tls=true&tlsAllowInvalidCertificates=true&serverSelectionTimeoutMS=5000&connectTimeoutMS=5000"
	$K -n "$NS" run "$1" --rm -i --restart=Never --quiet --image="$img" ${2:+--labels="$2"} --overrides="{
		\"apiVersion\": \"v1\",
		\"spec\": {
			\"securityContext\": {\"runAsNonRoot\": true, \"runAsUser\": 999, \"seccompProfile\": {\"type\": \"RuntimeDefault\"}},
			\"containers\": [{
				\"name\": \"$1\", \"image\": \"$img\",
				\"command\": [\"mongosh\", \"--quiet\", \"$uri\", \"--eval\", \"db.adminCommand({ping: 1}).ok\"],
				\"securityContext\": {\"allowPrivilegeEscalation\": false, \"capabilities\": {\"drop\": [\"ALL\"]}}
			}]
		}
	}"
}

# Only the listed components reach 27017 of the Mongo replica sets (issue
# #727). Control: the same pod labelled as the init Job connects, so the
# refusal comes from the NetworkPolicy, not from the image or the name.
verify_mongo_ingress() {
	local host component
	log "MongoDB 27017: refused to an unlisted pod, allowed to the init Job label"
	for host in mongo-audit-0.mongo-audit-headless:mongodb-audit-init; do
		component="${host#*:}"
		host="${host%%:*}"
		retry 3 mongo_ping mongo-probe-allowed "app.kubernetes.io/component=$component" "$host" >/dev/null || {
			log "  a $component pod could not reach $host: the check proves nothing"
			return 1
		}
		if mongo_ping mongo-probe-denied "" "$host" >/dev/null 2>&1; then
			log "  a pod without component label reached $host:27017"
			return 1
		fi
	done
}

# TCP connect of `$3` (host:port) from a throwaway pod `$1` with labels `$2`
# (none when empty), with bash of the MySQL image (issue #747).
tcp_probe() {
	local img
	img="$(grep -m1 -oE 'mysql(:[^@ ]+)?@sha256:[0-9a-f]+' "$ROOT/deploy/k8s/infra/mysql.yaml")"
	$K -n "$NS" run "$1" --rm -i --restart=Never --quiet --image="$img" ${2:+--labels="$2"} --overrides="{
		\"apiVersion\": \"v1\",
		\"spec\": {
			\"securityContext\": {\"runAsNonRoot\": true, \"runAsUser\": 999, \"seccompProfile\": {\"type\": \"RuntimeDefault\"}},
			\"containers\": [{
				\"name\": \"$1\", \"image\": \"$img\",
				\"command\": [\"timeout\", \"5\", \"bash\", \"-c\", \"exec 3<>/dev/tcp/${3%:*}/${3#*:}\"],
				\"securityContext\": {\"allowPrivilegeEscalation\": false, \"capabilities\": {\"drop\": [\"ALL\"]}}
			}]
		}
	}"
}

# Only the listed components reach MySQL and Redis (issue #747). Control: the
# same pod labelled as a listed client connects, so the refusal comes from the
# NetworkPolicy, not from the image or the name.
verify_db_ingress() {
	local target host label
	log "MySQL 3306, Redis 6379 and api-gateway 3000: refused to an unlisted pod, allowed to a listed component (issue #813)"
	for target in mysql-primary:3306:financial-scraper redis-sentinel-0.redis-sentinel-headless:26379:audit-logger api-gateway:3000:edge-proxy; do
		label="${target##*:}"
		host="${target%:*}"
		retry 3 tcp_probe db-probe-allowed "app.kubernetes.io/component=$label" "$host" >/dev/null || {
			log "  a $label pod could not reach $host: the check proves nothing"
			return 1
		}
		if tcp_probe db-probe-denied "" "$host" >/dev/null 2>&1; then
			log "  a pod without component label reached $host"
			return 1
		fi
	done
}

# Redis TLS (issue #930, ADR-0047): the certificate comes from cert-manager, a
# client verifying the name "redis" gets a TLS session on 6380 and 26380, and
# the clear ports answer exactly when REDIS_TLS_MODE is "optional".
verify_redis_tls() {
	local mode node cli user tls="--tls --cacert /etc/redis-tls/ca.crt --sni redis"
	log "Redis TLS: certificate verified by name, clear ports follow REDIS_TLS_MODE"
	$K -n "$NS" wait --for=condition=Ready certificate/redis-tls --timeout=120s
	mode="$($K -n "$NS" exec redis-0 -c redis -- printenv REDIS_TLS_MODE)"
	for node in redis-0:redis:6379:6380 redis-sentinel-0:sentinel:26379:26380; do
		IFS=: read -r pod container plain secure <<<"$node"
		# Sentinels have no ha user (requirepass only): the data nodes take the ha user.
		user=""; [ "$container" = redis ] && user="--user ha"
		cli="REDISCLI_AUTH=\$REDIS_INTERNAL_PASSWORD redis-cli $user"
		[ "$($K -n "$NS" exec "$pod" -c "$container" -- sh -c "$cli $tls -p $secure PING")" = PONG ] || {
			log "  no TLS session verified by name on $pod:$secure"
			return 1
		}
		if $K -n "$NS" exec "$pod" -c "$container" -- sh -c "$cli -p $plain PING" >/dev/null 2>&1; then
			[ "$mode" = optional ] || {
				log "  clear port $pod:$plain answers with REDIS_TLS_MODE=$mode"
				return 1
			}
		else
			[ "$mode" = required ] || {
				log "  clear port $pod:$plain refused with REDIS_TLS_MODE=$mode: the check proves nothing"
				return 1
			}
		fi
	done
	log "  REDIS_TLS_MODE=$mode, TLS session verified on the data node and the sentinel"
}

# Entries of journal streams audit-logger reads in N-1 and N, summed (on redis-0, as audit-logger).
journal_len() {
	# shellcheck disable=SC2016 # expanded in the pod
	$K -n "$NS" exec redis-0 -c redis -- sh -c 'for t in audit.heartbeat training.model.published risk.order.transitioned; do
		REDISCLI_AUTH=$REDIS_AUDIT_LOGGER_PASSWORD redis-cli --user audit-logger XLEN "trading-model:message-manager:journal:$t"; done' |
		awk '!/^[0-9]+$/ { bad = 1 } { s += $1 } END { if (bad || NR != 3) exit 1; print s }'
}

# Events risk-execution keeps in its outbox file until the bus accepts them (config/audit.ts).
risk_outbox_len() {
	$K -n "$NS" exec deployment/risk-execution -c risk-execution -- node -e 'const f="/data/risk-execution/risk-event-outbox.json",s=require("fs");console.log(s.existsSync(f)?JSON.parse(s.readFileSync(f)).length:0)'
}

# Bus library (ADR-0073, issue #1835): model-evaluator reads its topic in process
# (consumer model-evaluator-<uuid>) with its own ACL user, and the audit-dlq CLI
# reaches the dead streams. Wait until the trainer's publications have given at
# least one entry to the BusConsumer, handled without error.
verify_bus() {
	local key=trading-model:message-manager:journal:training.model.published
	log "bus: BusConsumer of model-evaluator, audit-dlq in audit-logger"
	wait_for 120 "$K -n $NS exec redis-0 -c redis -- sh -c 'REDISCLI_AUTH=\$REDIS_MODEL_EVALUATOR_PASSWORD redis-cli --user model-evaluator XINFO CONSUMERS $key model-evaluator' | grep -q '^model-evaluator-'"
	# Release N-1 workers may have read the entry first: assert on the group (read, nothing pending, no lag), not on this pod's counter.
	wait_for 600 "$K -n $NS exec redis-0 -c redis -- sh -c 'REDISCLI_AUTH=\$REDIS_MODEL_EVALUATOR_PASSWORD redis-cli --user model-evaluator XINFO GROUPS $key' | awk 'prev==\"name\"{g=(\$0==\"model-evaluator\")} g&&prev==\"entries-read\"{r=\$0} g&&prev==\"pending\"{p=\$0} g&&prev==\"lag\"{l=\$0} {prev=\$0} END{exit !(r>=1 && p==0 && l==0)}'" || {
		$K -n "$NS" exec redis-0 -c redis -- sh -c "REDISCLI_AUTH=\$REDIS_MODEL_EVALUATOR_PASSWORD redis-cli --user model-evaluator XINFO GROUPS $key" 2>&1 | tail -40
		$K -n "$NS" get pods -o wide | grep -E 'redis|model-evaluator|trader-trainer'
		$K -n "$NS" logs deploy/trader-trainer -c trader-trainer --tail=60 2>&1 | grep -iE "train|publish|error" | grep -v ENOTFOUND | tail -30
		return 1
	}
	$K -n "$NS" exec deploy/audit-logger -c audit-logger -- node services/audit-logger/dist/application/dlq-cli.js kind list training.model.published
}

# MySQL TLS (issue #767, ADR-0060), run from the tls-reload sidecar of mysql-0
# (mysql client, MYSQL_PWD = root password, client certificate of root):
# the server certificate is verified by name, a plain TCP connection is
# refused (require_secure_transport=ON), and so is a TLS connection of root
# without its client certificate (the password alone does not open a session).
verify_mysql_tls() {
	local tls="--ssl-mode=VERIFY_IDENTITY --ssl-ca=/etc/mysql-tls/ca.crt" cert="--ssl-cert=/etc/mysql-client-root/tls.crt --ssl-key=/etc/mysql-client-root/tls.key"
	local run="$K -n $NS exec mysql-0 -c tls-reload -- mysql -h mysql-primary -N -e"
	log "MySQL TLS: certificate verified by name, plain and certificate-less connections refused"
	$K -n "$NS" wait --for=condition=Ready certificate/mysql-tls certificate/mysql-client-root certificate/mysql-client-scraper --timeout=120s
	[ -n "$($run "SHOW STATUS LIKE 'Ssl_cipher'" -uroot $tls $cert | cut -f2)" ] || {
		log "  no TLS session with a client certificate and --ssl-mode=VERIFY_IDENTITY on mysql-primary"
		return 1
	}
	[ "$($run 'SELECT @@require_secure_transport' -uroot $tls $cert)" = 1 ] || {
		log "  require_secure_transport is not ON"
		return 1
	}
	if $run 'SELECT 1' -uroot --ssl-mode=DISABLED >/dev/null 2>&1; then
		log "  plain connection accepted"
		return 1
	fi
	if $run 'SELECT 1' -uroot $tls >/dev/null 2>&1; then
		log "  TLS connection without client certificate accepted"
		return 1
	fi
	log "  TLS session verified, plain and certificate-less connections refused"
}

# Runs deploy-k8s.sh against the kind cluster, as deploy.yml does.
deploy_script() {
	# As the "Configure gateway canary key" step of deploy.yml: written by the admin, read by deploy-app (issue #2791).
	$K -n "$NS" create secret generic gateway-canary-key --from-literal=GATEWAY_CANARY_KEY="$API_KEY" --dry-run=client -o yaml | $K apply -f - >/dev/null
	(cd "$ROOT" && use_kube &&
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
	trap 'kill ${traffic:-} ${forward:-} 2>/dev/null || true; deploy_script canary-cleanup api-gateway >/dev/null 2>&1 || true' RETURN
	wait_for 30 'curl -s -o /dev/null http://localhost:18450/'
	# 2.4 requests/s in bursts of 12 every 5 s (the gateway limits each API client
	# to 100/min per pod: ~72/min each here). edge-proxy keeps a keep-alive pool to the gateway and
	# kube-proxy picks the pod only when a connection opens: a request every
	# 0.5 s reuses one connection for minutes (13 canary requests in 60 s, issue
	# #724). A burst needs 12 connections and the 5 s pause outlives the pool's
	# keepalive_timeout (4 s), so each burst draws 12 new pod picks (~50% canary).
	(while :; do
		for _ in 1 2 3 4 5 6 7 8 9 10 11 12; do
			curl -s -o /dev/null -H "x-api-key: $API_KEY" http://localhost:18450/v1/trader-trainer/training-status &
		done
		wait
		sleep 5
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
		--from-literal=PUSHOVER_USER_KEY=kind \
		--from-literal=PUSHOVER_TOKEN=kind \
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
verify_release() {
	log "release gate (deploy-k8s.sh verify-release)"
	# The upgrade can fire SLOAvailabilityFastBurn for a few minutes (5 m window, low kind
	# traffic). Wait for it to clear (max 8 min) so the gate judges the settled stack; a
	# persistent alert still fails it.
	local waited=0
	while [[ -n "$(deploy_script firing-critical 2>/dev/null)" ]] && (( waited < 480 )); do
		sleep 30
		waited=$((waited + 30))
	done
	VERIFY_WINDOW_SECONDS=0 deploy_script verify-release
}

# The writable primary of the MongoDB replica set labelled `$1`.
mongo_primary() {
	local pod
	for pod in $($K -n "$NS" get pods -l "app.kubernetes.io/component=$1" -o jsonpath='{.items[*].metadata.name}'); do
		if [ "$($K -n "$NS" exec "$pod" -- mongosh --quiet --tls --tlsCAFile /keyfile/ca.crt --eval 'db.hello().isWritablePrimary' 2>/dev/null)" = "true" ]; then
			echo "$pod"
			return 0
		fi
	done
	return 1
}

mongo_eval() {
	# As `root` (ADR-0067); the password is in the pod's env.
	$K -n "$NS" exec "$(mongo_primary "$1")" -- sh -c 'mongosh --quiet --tls --tlsCAFile /keyfile/ca.crt -u root -p "$MONGO_ROOT_PASSWORD" --authenticationDatabase admin --eval "$1"' sh "$2"
}

mysql_root() {
	$K -n "$NS" exec mysql-0 -c mysql -- sh -c "MYSQL_PWD=\"\$MYSQL_ROOT_PASSWORD\" mysql -uroot -N -e \"$1\""
}

# "<idx_*_symbol_ts count> <idx_*_symbol count>" on the three market tables (ADR-0088).
symbol_ts_indexes() {
	mysql_root "SELECT CONCAT(COUNT(DISTINCT CASE WHEN index_name IN ('idx_candles_symbol_ts','idx_trades_symbol_ts','idx_tickers_symbol_ts') THEN index_name END), ' ', COUNT(DISTINCT CASE WHEN index_name IN ('idx_candles_symbol','idx_trades_symbol','idx_tickers_symbol') THEN index_name END)) FROM information_schema.statistics WHERE table_schema = 'financial_scraper'" | tr -d '\r'
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

# risk-execution admin route `$1` as scripts/risk-admin.sh: `status` from its own pod (service SVID),
# `kill-switch[/rearm]` with body `$2` through edge-proxy and the risk:admin key, actor = key name (ADR-0059).
risk_admin() {
	if [ "$1" = status ]; then
		$K -n "$NS" exec deployment/risk-execution -c risk-execution -- node -e 'const f=require("fs"),d="/run/spire/svid/",[m,u]=process.argv.slice(1);const q=require("https").request(u,{method:m,headers:{"content-type":"application/json"},cert:f.readFileSync(d+"svid.pem"),key:f.readFileSync(d+"svid_key.pem"),rejectUnauthorized:false},r=>r.pipe(process.stdout));q.on("error",()=>process.exit(1));q.end()' GET https://localhost:3000/admin/status
		return
	fi
	$K -n "$NS" port-forward svc/edge-proxy 18452:8080 >/dev/null 2>&1 &
	local forward=$!
	trap "kill $forward 2>/dev/null || true; trap - RETURN" RETURN
	wait_for 30 'curl -s -o /dev/null http://localhost:18452/'
	curl -sf -H "x-api-key: $API_KEY" -H content-type:application/json -d "${2:-}" "http://localhost:18452/v1/risk-execution/admin/$1"
}

# The real audit trail: tests/backup/audit-chain.js on the `audit` database
# (JSON: count, first, last, digest, broken).
audit_chain() {
	mongo_eval mongodb-audit "const AUDIT_DB = 'audit'; $(cat "$ROOT/tests/backup/audit-chain.js")"
}

# Publishes a dlq.entries.deleted audit event: dlq-cli delete of an unknown id, on a subscribed
# topic (the ACL only lets audit-logger write the dead streams of those); exit 1 is expected.
seed_audit_event() {
	$K -n "$NS" exec deployment/audit-logger -c audit-logger -- \
		node services/audit-logger/dist/application/dlq-cli.js drill delete training.model.published none >/dev/null 2>&1 || true
}

# Waits up to 300 s for field `$1` (count or last) of the audit chain to exceed
# `$2`. Market data is no longer chained (#992): the chain only grows on audit,
# training and DLQ events, so one is published every 30 s until it does.
audit_grows() {
	local waited=0
	until [ "$(audit_chain | json_field "$1")" -gt "$2" ] 2>/dev/null; do
		if [ "$waited" -ge 300 ]; then
			log "the audit chain did not grow in 300 s ($1 still not above $2)"
			return 1
		fi
		[ $((waited % 30)) -ne 0 ] || seed_audit_event
		sleep 5
		waited=$((waited + 5))
	done
}

# Field `$1` of the JSON object read on stdin.
json_field() {
	node -e 'const v = JSON.parse(require("fs").readFileSync(0, "utf8"))[process.argv[1]]; console.log(v === null ? "null" : v)' "$1"
}

# Metric `$1` of the audit-logger pods (one value per pod).
audit_metric() {
	local pod
	for pod in $($K -n "$NS" get pods -l app.kubernetes.io/component=audit-logger -o jsonpath='{.items[*].metadata.name}'); do
		$K -n "$NS" exec "$pod" -c audit-logger -- node -e 'const f=require("fs"),d="/run/spire/svid/";require("https").get(process.argv[1],{cert:f.readFileSync(d+"svid.pem"),key:f.readFileSync(d+"svid_key.pem"),rejectUnauthorized:false},r=>{r.pipe(process.stdout);process.exitCode=r.statusCode<300?0:1}).on("error",()=>process.exit(1))' https://localhost:3000/metrics 2>/dev/null |
			awk -v name="$1" '$1 == name {print int($2)}'
	done
}

# The services writing to the databases, stopped during a restore
# (BACKUP_DR.md): a write between the dump restore and the binlog / oplog
# replay would make the replay fail. The SPIRE server (SQLite on its own
# volume, ADR-0065) is stopped and restarted by restore-k8s.sh itself.
MONGO_WRITERS="audit-logger"
MYSQL_WRITERS="financial-scraper financial-scraper-collector"

# Restore drill: seeds known data, records the real audit trail (hash chain
# written by audit-logger from the live flow), runs the
# db-backup CronJob once (age key generated here, off-site copy to an
# in-cluster S3). Then point-in-time recovery (ADR-0031): more markers, audit
# events written after the dump, the writers stopped, the
# instant recorded, one marker written after it, and the
# db-backup-incremental CronJob run once. Destroys the data (the audit
# database, drill markers, the market_candles table, the SPIRE server
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
	for label in mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').markers.insertMany([{_id: 1}, {_id: 2}, {_id: 3}])" >/dev/null
		# Its password changes after the instant (issue #1050): the restore must keep the current one.
		mongo_eval "$label" "const a = db.getSiblingDB('admin'); try { a.dropUser('drill') } catch (e) {} a.createUser({user: 'drill', pwd: 'drill-old', roles: []})" >/dev/null
	done
	mysql_root "CREATE DATABASE restore_drill; CREATE TABLE restore_drill.markers (id INT PRIMARY KEY); INSERT INTO restore_drill.markers VALUES (1), (2), (3);"
	# Past retention (1827 days) and in the dump: restore-k8s.sh must purge it (issue #743).
	mysql_root "INSERT INTO financial_scraper.market_tickers (symbol, market, source, open, high, low, last, volume, timestamp, close_time) VALUES ('DRILLEXP', 'spot', 'drill', 1, 1, 1, 1, 1, NOW() - INTERVAL 2000 DAY, NOW() - INTERVAL 2000 DAY);"
	local bundle_before
	bundle_before="$(spire_bundle)"
	# risk:admin only now: in the Secret from the N-1 deploy on, the upgrade under probe dropped requests (N-1 refuses the unknown scope).
	$K -n "$NS" patch secret trading-model-secrets -p "{\"stringData\":{\"AUTH_TOKENS\":\"dev:read+dlq:write+risk:admin:$API_KEY\"}}" >/dev/null
	$K -n "$NS" rollout restart deployment/api-gateway >/dev/null
	$K -n "$NS" rollout status deployment/api-gateway --timeout=240s >/dev/null
	# Engaged before the backup, re-armed after it: the restore must bring it back (issue #1933).
	risk_admin kill-switch '{"scope":"symbol","symbol":"BTCUSDT","reason":"restore_drill"}' >/dev/null

	log "restore drill: recording the real audit trail"
	audit_grows count 0
	local audit_before audit_last
	audit_before="$(audit_chain)"
	[ "$(echo "$audit_before" | json_field broken)" = "null" ] || {
		log "the audit chain is broken before any backup: $audit_before"
		return 1
	}
	audit_last="$(echo "$audit_before" | json_field last)"
	log "  audit chain verified: $(echo "$audit_before" | json_field count) events up to sequence $audit_last"

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
	# 5 dumps + 2 PITR starting points (mysql, mongodb-audit) + the
	# run manifest (backup-lib.sh, write_manifest).
	[ "$offsite" -ge 8 ] || {
		log "only $offsite encrypted file(s) copied off-site (expected 8)"
		return 1
	}
	local listed
	listed="$(inspector "find /backups/manifests -name 'manifest_*.json.age' | wc -l")"
	[ "$listed" -ge 1 ] || {
		log "the backup run wrote no manifest: restore-k8s.sh would find nothing to restore"
		return 1
	}
	log "  every file is age-encrypted, $offsite copied off-site, run manifest written"
	risk_admin kill-switch/rearm '{"scope":"symbol","symbol":"BTCUSDT","reason":"after the backup"}' >/dev/null

	log "point-in-time: writes after the daily dump (markers, audit events)"
	local audit_dumped
	audit_dumped="$(audit_chain | json_field last)"
	for label in mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').markers.insertOne({_id: 4})" >/dev/null
	done
	mysql_root "INSERT INTO restore_drill.markers VALUES (4);"
	# Audit events written by audit-logger after the dump.
	audit_grows last "$audit_dumped"

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
	local audit_pitr until
	audit_pitr="$(audit_chain)"
	[ "$(echo "$audit_pitr" | json_field broken)" = "null" ] || {
		log "the audit chain is broken before the incremental backup: $audit_pitr"
		return 1
	}
	sleep 2
	until="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
	sleep 2
	# After the instant: archived, but must not come back.
	for label in mongodb-audit; do
		mongo_eval "$label" "db.getSiblingDB('restore_drill').markers.insertOne({_id: 5})" >/dev/null
		mongo_eval "$label" "db.getSiblingDB('admin').updateUser('drill', {pwd: 'drill-new'})" >/dev/null
	done
	mysql_root "INSERT INTO restore_drill.markers VALUES (5);"
	log "  instant $until: audit chain up to sequence $(echo "$audit_pitr" | json_field last) (dump: $audit_dumped)"

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
	for component in mysql-binlog mongodb-audit-oplog; do
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
	log "restore drill: disaster (audit database, markers, MySQL volume deleted, SPIRE volume deleted)"
	mongo_eval mongodb-audit "db.getSiblingDB('restore_drill').dropDatabase()" >/dev/null
	mongo_eval mongodb-audit "db.getSiblingDB('audit').dropDatabase()" >/dev/null
	[ "$(audit_chain | json_field count)" = "0" ] || {
		log "the audit database survived its drop: the drill tests nothing"
		return 1
	}
	# The MySQL volume itself: empty `mysql` schema (no migrator/retention/exporter), new server_uuid.
	$K -n "$NS" scale statefulset/mysql --replicas=0
	$K -n "$NS" wait --for=delete pod/mysql-0 --timeout=120s
	$K -n "$NS" delete pvc mysql-data-mysql-0 --wait=true
	$K -n "$NS" scale statefulset/mysql --replicas=1
	$K -n "$NS" rollout status statefulset/mysql --timeout=300s
	migrations "$ROOT" user-only || return 1
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
	# The run: 5 dumps + 2 PITR starting points + the run manifest, which
	# restore-k8s.sh selects and verifies with; then the archives replayed.
	fetched="$(runner "find /restore -type f \( -name '*.archive.gz.age' -o -name 'financial_scraper_*.sql.gz.age' -o -name 'checkpoints_*.age' -o -name 'risk_*.age' -o -name 'data_*.tar.age' -o -name 'keys_*.age' -o -name '*.pitr.age' -o -name 'manifest_*.json.age' \) | wc -l")"
	[ "$fetched" -eq 8 ] && runner "test -s /restore/manifests/manifest_*.json.age" || {
		log "fetch-offsite.sh fetched $fetched file(s) of the run instead of 8 (5 dumps, 2 PITR starting points, run manifest)"
		return 1
	}
	for dir in mysql/binlog mongodb/oplog/mongodb-audit; do
		[ "$(runner "find /restore/$dir -type f -name '*.gz.age' | wc -l")" -ge 1 ] || {
			log "fetch-offsite.sh --pitr fetched no archive into $dir"
			return 1
		}
	done

	# An instant the archives do not reach yet: refused before touching data.
	local refused
	if refused="$(echo "$key" | $K -n "$NS" exec -i restore-runner -- sh -c \
		"umask 077 && cat > /tmp/identity && BACKUP_DIR=/restore BACKUP_AGE_IDENTITY=/tmp/identity K8S_NAMESPACE=$NS \
		bash /scripts/restore-k8s.sh --dry-run --components mongodb-audit,mysql --until $(date -u +%Y-%m-%dT%H:%M:%SZ) 2>&1; \
		rc=\$?; rm -f /tmp/identity; exit \$rc")"; then
		log "restore-k8s.sh --until accepted an instant after the last archive: $refused"
		return 1
	fi
	[ "$(echo "$refused" | grep -cE 'do not reach the requested instant|before the requested instant')" -eq 2 ] || {
		log "restore-k8s.sh --until refused for another reason: $refused"
		return 1
	}
	log "  run and archives fetched, an instant past the archives is refused"

	log "restore drill: scripts/restore-k8s.sh --until $until on the fetched run"
	started=$SECONDS
	# The identity goes through stdin and is deleted after the restore. The
	# output is kept: restore-k8s.sh logs the duration of each component.
	local restore_log
	restore_log="$(mktemp)"
	echo "$key" | $K -n "$NS" exec -i restore-runner -- sh -c \
		"umask 077 && cat > /tmp/identity && BACKUP_DIR=/restore BACKUP_AGE_IDENTITY=/tmp/identity K8S_NAMESPACE=$NS \
		bash /scripts/restore-k8s.sh --components mongodb-audit,mysql,checkpoints,spire,risk --until $until; rc=\$?; rm -f /tmp/identity; exit \$rc" |
		tee "$restore_log"
	restore_seconds=$((SECONDS - started))
	drill_record_components "$restore_log"
	rm -f "$restore_log"
	drill_record restore_total_host "$restore_seconds"
	log "  off-site fetch ${fetch_seconds} s, restore ${restore_seconds} s (total $((fetch_seconds + restore_seconds)) s)"

	log "restore drill: checking the restored data"
	step_started=$SECONDS
	# Markers 1-3 from the dump, 4 from the replay, never 5 (after the instant).
	for label in mongodb-audit; do
		local markers
		markers="$(mongo_eval "$label" "print(db.getSiblingDB('restore_drill').markers.find().sort({_id: 1}).toArray().map((m) => m._id).join(','))")"
		[ "$markers" = "1,2,3,4" ] || {
			log "MongoDB $label: drill markers $markers instead of 1,2,3,4"
			return 1
		}
		# The dump holds drill-old: the restore must keep the Secret-era password (issue #1050).
		$K -n "$NS" exec "$(mongo_primary "$label")" -- mongosh --quiet --tls --tlsCAFile /keyfile/ca.crt -u drill -p drill-new --authenticationDatabase admin \
			--eval "db.runCommand({connectionStatus: 1}).authInfo.authenticatedUsers.length" | grep -qx 1 || {
			log "MongoDB $label: the user changed after the dump no longer authenticates with its current password"
			return 1
		}
	done
	local mysql_markers
	mysql_markers="$(mysql_root "SELECT GROUP_CONCAT(id ORDER BY id) FROM restore_drill.markers")"
	[ "$mysql_markers" = "1,2,3,4" ] || {
		log "MySQL: drill markers $mysql_markers instead of 1,2,3,4"
		return 1
	}
	[ "$(mysql_root "SELECT COUNT(*) FROM mysql.user WHERE user IN ('migrator','retention','exporter')" | tr -d '')" = "3" ] || {
		log "MySQL: migrator, retention or exporter missing after the restore"
		return 1
	}
	[ "$(mysql_count market_candles)" -gt 0 ] || {
		log "MySQL: market_candles was not restored"
		return 1
	}
	[ "$(mysql_root "SELECT COUNT(*) FROM financial_scraper.market_tickers WHERE symbol='DRILLEXP'" | tr -d '\r')" = "0" ] || {
		log "MySQL: the row past its retention came back with the restore (post-restore purge missing)"
		return 1
	}
	[ "$(spire_bundle)" = "$bundle_before" ] || {
		log "the SPIRE trust bundle differs: the CA keys were not restored"
		return 1
	}
	risk_admin status | grep -q '"BTCUSDT":"restore_drill"' || {
		log "risk-execution: the kill switch engaged before the backup is off after the restore"
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
	log "  audit trail restored up to the instant: $(echo "$audit_restored" | json_field count) events" \
		"(sequence $audit_dumped at the dump, $(echo "$audit_restored" | json_field last) restored), same hashes, chain verified"

	# Operator command (issue #322): same checks a real restore gets, read-only.
	log "restore drill: scripts/verify-restore-k8s.sh on the restored data"
	# The run manifest, decrypted in the runner, gives it the row counts of the dump.
	local mdir verify_out comp
	mdir="$(mktemp -d)"
	mkdir "$mdir/manifests"
	echo "$key" | $K -n "$NS" exec -i restore-runner -- sh -c \
		"umask 077 && cat > /tmp/identity && age -d -i /tmp/identity /restore/manifests/manifest_*.json.age; rc=\$?; rm -f /tmp/identity; exit \$rc" \
		>"$mdir/manifests/manifest_drill.json"
	for comp in mysql mongodb-audit; do
		grep "\"component\":\"$comp\"" "$mdir/manifests/manifest_drill.json" | grep -q '"rows":{' || {
			log "the run manifest has no rows for $comp: the row count at the dump failed silently"
			return 1
		}
	done
	verify_out="$(BACKUP_DIR="$mdir" K8S_NAMESPACE="$NS" bash "$ROOT/scripts/verify-restore-k8s.sh" 2>&1)" || {
		log "verify-restore-k8s.sh failed on a correctly restored cluster: $verify_out"
		return 1
	}
	echo "$verify_out" | grep -q "rows (manifest" || {
		log "verify-restore-k8s.sh compared no row counts: $verify_out"
		return 1
	}
	# Negative test: a manifest counting more rows than restored (partial restore) must fail.
	sed -i 's/"audit.audit_events":[0-9]*/"audit.audit_events":999999999/' "$mdir/manifests/manifest_drill.json"
	if BACKUP_DIR="$mdir" K8S_NAMESPACE="$NS" bash "$ROOT/scripts/verify-restore-k8s.sh" >/dev/null 2>&1; then
		log "verify-restore-k8s.sh accepted a table with fewer rows than the manifest"
		return 1
	fi
	rm -rf "$mdir"
	log "  row counts of the manifest compared; a table below the manifest fails"
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

	# TTL indexes came back with mongorestore (no --noIndexRestore) and purge.
	# audit_events is a hash chain: only its index is checked, never a document.
	local ttl_audit
	ttl_audit="$(mongo_eval mongodb-audit "print(db.getSiblingDB('audit').audit_events.getIndexes().filter((i) => i.expireAfterSeconds === 0).length)" | tail -1)"
	if [ "$ttl_audit" != 1 ]; then
		log "TTL index missing after restore (audit: $ttl_audit)"
		return 1
	fi
	log "  TTL index of audit_events restored"

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
		$K -n "$NS" exec "$pod" -c mongodb -- mongosh --quiet --tls --tlsCAFile /keyfile/ca.crt --eval 'JSON.stringify(rs.status())' 2>&1 | cut -c1-600 || true
	done
	echo "===== loki-0 (loki), promtail warnings, loki labels"
	$K -n "$NS" logs loki-0 -c loki --tail=200 2>&1 | cut -c1-300 || true
	$K -n "$NS" logs loki-0 -c loki --previous --tail=100 2>&1 | cut -c1-300 || true
	$K -n trading-model-node logs ds/promtail --tail=200 2>&1 | grep -E "level=(warn|error)" | cut -c1-300 | tail -40 || true
	$K -n "$NS" get --raw /api/v1/namespaces/$NS/services/loki:http/proxy/loki/api/v1/labels 2>&1 || true
	echo "===== spire-server (spire-entries)"
	$K -n "$NS" logs deploy/spire-server -c spire-entries --tail=40 2>&1 || true
	$K -n trading-model-node logs daemonset/spire-agent --tail=40 || true
	# The market data path and the audit trail, even when their pods look healthy (verify checks them).
	for workload in binance-stub financial-scraper-collector financial-scraper audit-logger api-gateway trader-trainer otel-collector; do
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

rm -f "$WORK/last-log" # a line of an earlier CI step is not this failure
trap 'fail_summary $? "$*"' EXIT
case "${1:-all}" in
all)
	if [ "${KEEP_CLUSTER:-0}" != "1" ]; then
		trap 'rc=$?; fail_summary "$rc" all || dump; delete; exit $rc' EXIT
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
images | load | cluster | deploy | upgrade | smoke | verify | verify_egress | verify_mongo_ingress | verify_db_ingress | verify_mysql_tls | verify_redis_tls | verify_canary | verify_identity_without_mysql | verify_release | verify_alerts | verify_backup | verify_traces | dump | delete) "$1" ;;
*)
	echo "usage: $0 [all|images|load|cluster|deploy|upgrade|smoke|verify|verify_group <network|observability|backup>|verify_egress|verify_mongo_ingress|verify_db_ingress|verify_mysql_tls|verify_redis_tls|verify_canary|verify_identity_without_mysql|verify_release|verify_alerts|verify_backup|dump|delete]" >&2
	exit 64
	;;
esac
