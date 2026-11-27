#!/usr/bin/env bash
# The release steps of deploy.yml that change the cluster, shared with the
# `k8s` CI job (tests/k8s/run-kind.sh): the job upgrades N-1 to N, forces a
# failure and rolls back through these same commands (issue #413), so the
# path deploy.yml runs is the one CI tests. kubectl uses the current context.
#
#   deploy-release.sh deployments
#       Prints the Deployments a release rolls out.
#   deploy-release.sh record <namespace> <revisions-file>
#       Revision each Deployment runs before the overlay ("<deployment> <rev>",
#       `none` when it does not exist yet), kept in configmap/deploy-revisions:
#       while it exists, a new run reuses it instead.
#   deploy-release.sh release-replicas <namespace>
#       Deletes retired HPAs and the finished Mongo init Jobs (immutable pod
#       template, recreated by the apply), then drops spec.replicas from
#       last-applied-configuration of HPA-driven Deployments (needs jq).
#   deploy-release.sh render <overlay-dir> <registry> <digests-file> [<tag>]
#       Prints the overlay with every first-party image pinned by digest
#       ("<image> <sha256:...>" per line); the caller pipes it to kubectl apply.
#   deploy-release.sh without-redis <namespace> < app-scope.yaml
#       Prints the render on stdin without the Redis StatefulSets once they
#       exist (all of it on a first deploy); the caller pipes it to kubectl apply.
#   deploy-release.sh prepull <namespace> < app-scope.yaml
#       Before the apply: pulls image N of the Recreate Deployments (RECREATE_DEPLOYMENTS) onto
#       the node of their current pod, through a throwaway pod. A failure only warns.
#   deploy-release.sh redis-last <namespace> < app-scope.yaml
#       After `wait`: waits for certificate/redis-tls, then applies the Redis
#       StatefulSets of the render on stdin and waits for their rollout. Redis
#       restarts under the pods of this release only: those of a release older
#       than issue #1112 lose the registry when Redis restarts under them (ADR-0045,
#       issue #1156). Clients of this release run against the previous Redis meanwhile
#       (REDIS_TLS_MODE=optional, same ACL users). A partitioned redis-0 on an older
#       template (staging-local) is then replaced through a Sentinel failover (issue #2882).
#   deploy-release.sh dry-run <namespace> <node-agents-dir> < rendered.yaml
#       Preflight (issue #805): `kubectl apply --dry-run=server` of the render
#       on stdin, cluster scope + node agents with CLUSTER_KUBECONFIG, the rest
#       with the current context (ADR-0041), as the deploy applies them.
#       Nothing is changed. A namespace that does not exist yet (first deploy)
#       skips the application part with a warning.
#   deploy-release.sh wait <namespace> [timeout]
#       Waits for the rollout of every Deployment: timeout (default 180s) plus
#       the terminationGracePeriodSeconds of its pod template.
#   deploy-release.sh rollback <namespace> <revisions-file>
#       Returns every Deployment to the revision `record` wrote and waits for
#       each rollout (180s); fails if any did not come back. Waits first for the
#       API server (300s); forgets the recorded revisions on success.
#   deploy-release.sh forget <namespace>
#       Deletes configmap/deploy-revisions: the release deployed.
#   deploy-release.sh pre-migrate-backup <namespace> <job> <environment>
#       MySQL dump from the db-backup CronJob before the migrations, waited for
#       (fails on a failed dump). Outside production: no off-site copy, own metrics file.
#   deploy-release.sh schema-check <namespace> <migrations-dir>
#       Rollback input of deploy.yml: fails, naming them, when the live schema has applied migrations
#       this checkout (the ref redeployed) lacks. Never migrates down. No MySQL: passes.
#
# GRAFANA_ALLOWED_CIDRS: comma-separated CIDRs; `render` sets them as whitelist-source-range of grafana-ingress (issue #1630).
# DEPLOY_TIMEOUT_FACTOR: integer the wait and rollback timeouts are multiplied
# by (default 1; a slow cluster such as the local kind staging).
set -euo pipefail

FACTOR="${DEPLOY_TIMEOUT_FACTOR:-1}"
[[ $FACTOR =~ ^[1-9][0-9]*$ ]] || {
	echo "deploy-release.sh: DEPLOY_TIMEOUT_FACTOR must be a positive integer, got $FACTOR" >&2
	exit 64
}

# Deployments a release rolls out and a failed release rolls back.
# The service list is deploy/k8s/services/kustomization.yaml; the collector is a second Deployment of financial-scraper.
DEPLOYMENTS="$(sed -n 's/^ *- \(.*\)\.yaml$/\1/p' "$(dirname "${BASH_SOURCE[0]}")/../services/kustomization.yaml") financial-scraper-collector"

# Redis and its sentinels: the services' credentials (ADR-0047) only work
# against the nodes of their own release, so these roll out and back too.
STATEFULSETS="redis redis-sentinel"

REVISIONS_CM=deploy-revisions

# Single-replica Deployments with strategy Recreate (ADR-0064, ADR-0049).
RECREATE_DEPLOYMENTS="risk-execution model-evaluator"

# Finished init Jobs `release-replicas` deletes before the apply (immutable pod template).
INIT_JOBS="mongo-audit-users"

# Documents of the render on stdin that are (keep=1) or are not (keep=0) a Redis StatefulSet.
redis_statefulsets() {
	awk -v keep="$1" '
	function flush() {
		if (doc != "" && (doc ~ /(^|\n)kind: StatefulSet\n/ && doc ~ /(^|\n)  name: (redis|redis-sentinel)\n/) == keep) { printf "%s%s", sep, doc; sep = "---\n" }
		doc = ""
	}
	/^---[ \t]*$/ { flush(); next }
	{ doc = doc $0 "\n" }
	END { flush() }'
}

without_redis() {
	if kubectl get statefulset redis -n "$1" >/dev/null 2>&1; then redis_statefulsets 0; else cat; fi
}

redis_last() {
	local ns="$1" sts
	# The pods mount Secret redis-tls (ADR-0047), issued from the Certificate the overlay
	# just applied: from a release without Redis TLS they would stay in ContainerCreating (issue #1138).
	kubectl wait --for=condition=Ready certificate/redis-tls -n "$ns" --timeout="$((300 * FACTOR))s" || return 1
	redis_unswap "$ns" || return 1
	redis_statefulsets 1 | kubectl apply -f - || return 1
	for sts in $STATEFULSETS; do
		kubectl rollout status "statefulset/$sts" -n "$ns" --timeout="$((300 * FACTOR))s" || return 1
	done
	redis_swap "$ns"
}

# redis-cli in container $3 of Redis pod $2, with the password of its start script (redis-ha.sh).
# shortcut: clear ports only (REDIS_TLS_MODE optional); add --tls with the required step (ADR-0047).
redis_cli() {
	local ns="$1" pod="$2" container="$3"
	shift 3
	kubectl exec "$pod" -n "$ns" -c "$container" -- sh -c 'REDISCLI_AUTH="$REDIS_INTERNAL_PASSWORD" exec redis-cli --raw "$@"' sh "$@"
}

repl_offset() {
	redis_cli "$1" "$2" redis --user ha INFO replication | sed -n 's/^master_repl_offset:\([0-9]*\).*/\1/p'
}

# Makes Redis pod $2 the master once it is a synced replica. The old master holds writes (CLIENT
# PAUSE WRITE) until the replica has them all, the sentinel promotes it (SENTINEL FAILOVER), the old
# master turns replica and resumes: a held write gets READONLY and is published again, none is lost
# (ADR-0090). Only an old master whose `ha` user predates ADR-0090 (NOPERM) fails over unpaused: a
# write it takes before the clients follow the switch (failoverDetector) is lost.
failover_to() {
	local ns="$1" pod="$2" old="redis-$((1 - ${2#redis-}))" ip paused="" waited=0 offset
	ip=$(kubectl get pod "$pod" -n "$ns" -o jsonpath='{.status.podIP}') || return 1
	until [ "$(redis_cli "$ns" redis-sentinel-0 sentinel -p 26379 SENTINEL get-master-addr-by-name mymaster | head -n 1)" = "$ip" ]; do
		# Writes are held 30 passes at most.
		if [ "$waited" -ge $((300 * FACTOR)) ] || { [ -n "$paused" ] && [ $((waited - paused)) -ge 30 ]; }; then
			echo "::error::The sentinel did not make $pod the Redis master in $waited s"
			[ -z "$paused" ] || redis_cli "$ns" "$old" redis --user ha CLIENT UNPAUSE >/dev/null
			return 1
		fi
		# Paused only once the sentinel can promote: replica linked and listed (else NOGOODSLAVE).
		if redis_cli "$ns" "$pod" redis --user ha INFO replication | grep '^master_link_status:up' >/dev/null &&
			redis_cli "$ns" redis-sentinel-0 sentinel -p 26379 SENTINEL replicas mymaster | grep -x "$ip" >/dev/null; then
			# Re-armed each pass; expires by itself if this run dies. Any other answer: next pass.
			case "$(redis_cli "$ns" "$old" redis --user ha CLIENT PAUSE 30000 WRITE 2>&1)" in
			OK)
				paused=${paused:-$waited}
				offset=$(repl_offset "$ns" "$pod")
				[ -n "$offset" ] && [ "$offset" = "$(repl_offset "$ns" "$old")" ] &&
					redis_cli "$ns" redis-sentinel-0 sentinel -p 26379 SENTINEL FAILOVER mymaster
				;;
			*NOPERM*) redis_cli "$ns" redis-sentinel-0 sentinel -p 26379 SENTINEL FAILOVER mymaster ;;
			esac
		fi
		sleep 1
		waited=$((waited + 1))
	done
	[ -n "$paused" ] || return 0
	redis_cli "$ns" "$old" redis --user ha REPLICAOF "$ip" 6379 >/dev/null &&
		redis_cli "$ns" "$old" redis --user ha CLIENT UNPAUSE >/dev/null
}

# staging-local holds its single redis-0 by `partition: 1`: it keeps the template, so the ACL users,
# of an older release (issue #2882). Replaced without stopping the master: redis-1 joins on the new
# template, takes the master role, redis-0 is updated as its replica and takes the role back.
redis_swap() {
	local ns="$1" part replicas upd t="--timeout=$((300 * FACTOR))s"
	read -r part replicas upd <<<"$(kubectl get statefulset redis -n "$ns" -o jsonpath='{.spec.updateStrategy.rollingUpdate.partition} {.spec.replicas} {.status.updateRevision}')"
	[ "$part" = 1 ] && [ "$replicas" = 1 ] &&
		[ "$(kubectl get pod redis-0 -n "$ns" -o jsonpath='{.metadata.labels.controller-revision-hash}')" != "$upd" ] || return 0
	echo "redis-0 runs a template older than $upd: replaced through a Sentinel failover"
	kubectl patch statefulset redis -n "$ns" -p '{"metadata":{"annotations":{"trading-model/redis-swap":"1"}},"spec":{"replicas":2}}' &&
		kubectl rollout status statefulset/redis -n "$ns" "$t" &&
		failover_to "$ns" redis-1 &&
		kubectl patch statefulset redis -n "$ns" -p '{"spec":{"updateStrategy":{"rollingUpdate":{"partition":0}}}}' &&
		kubectl rollout status statefulset/redis -n "$ns" "$t" &&
		redis_unswap "$ns" &&
		kubectl rollout status statefulset/redis -n "$ns" "$t" &&
		# The sentinel would keep the IPs of the replaced pods in its replica list.
		redis_cli "$ns" redis-sentinel-0 sentinel -p 26379 SENTINEL RESET mymaster >/dev/null
}

# Ends a swap (annotation trading-model/redis-swap), also one a stopped run left with the master on
# redis-1: the apply or a rollout undo would restart it first, and one sentinel (quorum 2) never
# fails over by itself. redis-0 takes the master role back, then one pod and `partition: 1`.
redis_unswap() {
	[ "$(kubectl get statefulset redis -n "$1" --ignore-not-found -o jsonpath='{.metadata.annotations.trading-model/redis-swap}')" = 1 ] || return 0
	failover_to "$1" redis-0 &&
		kubectl patch statefulset redis -n "$1" -p '{"metadata":{"annotations":{"trading-model/redis-swap":null}},"spec":{"replicas":1,"updateStrategy":{"rollingUpdate":{"partition":1}}}}'
}

# Image N is pulled on the node that runs the current pod (restricted profile), so the Recreate
# pause (old pod stopped, new one not started) does not include the pull (issue #2849).
prepull() {
	local ns="$1" render dep image node pod manifest
	render="$(cat)"
	for dep in $RECREATE_DEPLOYMENTS; do
		image=$(awk -v n="$dep" '/image:/ && $NF ~ ("/" n "[@:]") {print $NF; exit}' <<<"$render")
		node=$(kubectl get pods -n "$ns" -l "app.kubernetes.io/component=$dep" -o jsonpath='{.items[0].spec.nodeName}' 2>/dev/null) || node=""
		[ -n "$image" ] && [ -n "$node" ] || continue
		pod="prepull-$dep"
		manifest="apiVersion: v1
kind: Pod
metadata: {name: $pod}
spec:
  nodeName: $node
  restartPolicy: Never
  automountServiceAccountToken: false
  securityContext: {runAsNonRoot: true, runAsUser: 10001, seccompProfile: {type: RuntimeDefault}}
  containers:
    - name: pull
      image: $image
      imagePullPolicy: Always
      command: [node, -e, \"0\"]
      securityContext: {allowPrivilegeEscalation: false, readOnlyRootFilesystem: true, capabilities: {drop: [ALL]}}"
		echo "Pre-pulling $image on $node"
		if ! { kubectl apply -n "$ns" -f - <<<"$manifest" &&
			kubectl wait --for=jsonpath='{.status.phase}'=Succeeded "pod/$pod" -n "$ns" --timeout="$((600 * FACTOR))s"; }; then
			echo "::warning::Pre-pull of $image for $dep failed: the pod of release N pulls it itself"
		fi
		kubectl delete pod "$pod" -n "$ns" --ignore-not-found --wait=false || true
	done
}

usage() {
	echo "usage: $0 without-redis <ns> | prepull <ns> | redis-last <ns> | record <ns> <file> | release-replicas <ns> | render <overlay-dir> <registry> <digests-file> | dry-run <ns> <node-agents-dir> | wait <ns> [timeout] | rollback <ns> <file> | forget <ns> | pre-migrate-backup <ns> <job> <env>" >&2
	exit 64
}

# Revision each Deployment runs before the overlay: the rollback returns to
# exactly it (image and hashed ConfigMap), not to "the one before the
# current", which is older than N for a Deployment the overlay left as is.
# Kept in ConfigMap deploy-revisions until `forget` or a successful rollback: a re-run
# after a rollback that could not finish (API server down) must return to N-1, not
# to the half-applied N it now finds (issue #1192). Delete it after a manual fix.
record() {
	local ns="$1" file="$2" dep rev sts cr
	kubectl get configmap "$REVISIONS_CM" -n "$ns" --ignore-not-found -o jsonpath='{.data.revisions}' >"$file" || return 1
	if [ -s "$file" ]; then
		echo "Revisions recorded by an unfinished deploy (configmap/$REVISIONS_CM):"
		cat "$file"
		return
	fi
	{
		for sts in $STATEFULSETS; do
			cr=$(kubectl get statefulset "$sts" -n "$ns" --ignore-not-found \
				-o jsonpath='{.status.currentRevision}')
			rev=""
			[ -z "$cr" ] || rev=$(kubectl get controllerrevision "$cr" -n "$ns" -o jsonpath='{.revision}')
			echo "statefulset/$sts ${rev:-none}"
		done
		for dep in $DEPLOYMENTS; do
			rev=$(kubectl get deployment "$dep" -n "$ns" --ignore-not-found \
				-o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')
			echo "$dep ${rev:-none}"
		done
	} | tee "$file"
	kubectl create configmap "$REVISIONS_CM" -n "$ns" --from-file=revisions="$file"
}

forget() {
	kubectl delete configmap "$REVISIONS_CM" -n "$1" --ignore-not-found
	# discovery-server (retired, ADR-0072): the apply no longer carries it. Removed only after a
	# good release: pods of release N need it to be Ready, so a rollback to N must still find it.
	kubectl delete deployment/discovery-server service/discovery-server hpa/discovery-server-hpa pdb/discovery-server-pdb networkpolicy/discovery-server-network-policy serviceaccount/discovery-server -n "$1" --ignore-not-found
	kubectl delete vpa/discovery-server-vpa -n "$1" --ignore-not-found 2>/dev/null || true
}

# Deployments driven by an HPA carry no spec.replicas in the overlay. A
# client-side apply of a manifest that drops a field it applied before
# resets it to the default (1), so the field leaves
# last-applied-configuration first (Kubernetes docs, "Migrating
# Deployments and StatefulSets to horizontal autoscaling"). No-op once done
# and on a first deploy (no HPA yet).
release_replicas() {
	local ns="$1" ann='kubectl.kubernetes.io/last-applied-configuration' dep last
	# A Job's pod template is immutable: apply fails on a finished init Job
	# whose template changed (labels, issues #727 and #771). All are idempotent and
	# run again from the overlay.
	# shellcheck disable=SC2086
	kubectl delete job $INIT_JOBS -n "$ns" --ignore-not-found
	# podManagementPolicy is immutable (issue #2202, now Parallel): drop the old
	# StatefulSet without its pods or PVCs; the apply recreates it and adopts them.
	if [ "$(kubectl get statefulset redis -n "$ns" -o jsonpath='{.spec.podManagementPolicy}' --ignore-not-found)" = OrderedReady ]; then
		kubectl delete statefulset redis -n "$ns" --cascade=orphan
	fi
	for dep in $(kubectl get hpa -n "$ns" \
		-o jsonpath='{range .items[?(@.spec.scaleTargetRef.kind=="Deployment")]}{.spec.scaleTargetRef.name}{"\n"}{end}'); do
		last=$(kubectl get deployment "$dep" -n "$ns" -o json | jq -r --arg a "$ann" '.metadata.annotations[$a] // empty')
		[ -n "$last" ] || continue
		echo "$last" | jq -e '.spec | has("replicas")' >/dev/null || continue
		kubectl annotate deployment "$dep" -n "$ns" --overwrite "$ann=$(echo "$last" | jq -c 'del(.spec.replicas)')"
		echo "$dep: spec.replicas removed from last-applied-configuration"
	done
}

# The manifests name the images ghcr.io/trading-model/<image>: a wrapper
# kustomization next to the overlay rewrites them to <registry>/<image>@digest.
# A release tag (X.Y.Z) also moves the runbook_url links from blob/main/ to blob/vX.Y.Z/
# (issue #939); the sources and the compose/K8s comparison keep main.
render() {
	local overlay="$1" registry="$2" digests="$3" tag="${4:-}" img digest ref=main
	[[ "$tag" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] && ref="v$tag"
	local wrapper
	wrapper="$(dirname "$overlay")/.deploy-$(basename "$overlay")"
	[ -s "$digests" ] || {
		echo "deploy-release.sh: no image digest in $digests" >&2
		return 1
	}
	mkdir -p "$wrapper"
	{
		echo "apiVersion: kustomize.config.k8s.io/v1beta1"
		echo "kind: Kustomization"
		echo "resources:"
		echo "  - ../$(basename "$overlay")"
		echo "images:"
		while read -r img digest; do
			echo "  - name: ghcr.io/trading-model/$img"
			echo "    newName: $registry/$img"
			echo "    digest: $digest"
		done <"$digests"
		if [ -n "${GRAFANA_ALLOWED_CIDRS:-}" ]; then
			echo "patches:"
			echo "  - target: {kind: Ingress, name: grafana-ingress}"
			echo "    patch: |-"
			echo "      - {op: add, path: /metadata/annotations/nginx.ingress.kubernetes.io~1whitelist-source-range, value: \"$GRAFANA_ALLOWED_CIDRS\"}"
		fi
	} >"$wrapper/kustomization.yaml"
	# jobs/ packages scripts/backup-k8s.sh from outside its directory: the default
	# load restrictor rejects it and kubectl apply -k cannot relax it.
	# Rendered to a file first: a piped kustomize that dies leaves sed with a broken pipe (run 43321359421).
	local rendered
	rendered="$(mktemp)"
	kubectl kustomize --load-restrictor LoadRestrictionsNone "$wrapper" >"$rendered" || { rm -f "$rendered"; return 1; }
	sed "s#/trading-model/blob/main/#/trading-model/blob/$ref/#g" "$rendered"
	rm -f "$rendered"
}

# Server-side dry-run of what "Apply cluster-scope objects", "Apply SPIFFE node
# components" and "Apply overlay" send, each with its own identity: admission,
# schemas, immutable fields and RBAC are checked by the API server, nothing is
# persisted. The init Jobs are left out: the real deploy deletes them first.
dry_run() {
	local ns="$1" agents="$2" rendered split out
	: "${CLUSTER_KUBECONFIG:?deploy-release.sh dry-run: CLUSTER_KUBECONFIG must name the deploy-cluster kubeconfig}"
	split="$(dirname "$0")/../../../scripts/split-cluster-scope.sh"
	rendered="$(cat)"
	[ -n "$rendered" ] || {
		echo "deploy-release.sh: no manifest on stdin" >&2
		return 64
	}
	echo "Cluster-scope objects (deploy-cluster):"
	bash "$split" cluster <<<"$rendered" | KUBECONFIG="$CLUSTER_KUBECONFIG" kubectl apply --dry-run=server -f -
	echo "SPIFFE node components (deploy-cluster):"
	kubectl kustomize "$agents" | KUBECONFIG="$CLUSTER_KUBECONFIG" kubectl apply --dry-run=server -f -
	# Only NotFound means "first deploy": Forbidden or an unreachable API fails.
	if ! out=$(KUBECONFIG="$CLUSTER_KUBECONFIG" kubectl get namespace "$ns" -o name 2>&1); then
		grep -q NotFound <<<"$out" || {
			echo "$out" >&2
			return 1
		}
		echo "::warning::Namespace $ns does not exist yet (first deploy): the application part is not dry-run, the deploy creates it"
		return 0
	fi
	echo "Overlay (deploy-app):"
	# StatefulSet redis still OrderedReady: podManagementPolicy is immutable and
	# release-replicas recreates it (issue #2202), so the dry-run leaves it out.
	local skip_redis=0
	[ "$(kubectl get statefulset redis -n "$ns" -o jsonpath='{.spec.podManagementPolicy}' --ignore-not-found)" = OrderedReady ] && skip_redis=1
	bash "$split" app <<<"$rendered" | awk -v jobs=" $INIT_JOBS " -v skip="$skip_redis" '
function flush() {
	if (doc != "" && !(kind == "Job" && index(jobs, " " name " ")) && !(skip == 1 && kind == "StatefulSet" && name == "redis")) { printf "%s%s", sep, doc; sep = "---\n" }
	doc = ""; kind = ""; name = ""
}
/^---[ \t]*$/ { flush(); next }
/^kind:[ \t]/ && kind == "" { kind = $2 }
/^  name:[ \t]/ && name == "" { name = $2 }
{ doc = doc $0 "\n" }
END { flush() }
' | kubectl apply --dry-run=server -f -
}

# Why a rollout did not finish (slow or broken), printed before the caller
# fails: the workload's description, recent Warning events, and the last logs
# of every pod that is not ready. Best effort: it never changes the exit code.
diagnose() {
	local ns="$1" target="$2" pod
	echo "::group::Diagnostics for $target"
	kubectl describe "$target" -n "$ns" 2>&1 | tail -40 || true
	kubectl get events -n "$ns" --field-selector type=Warning --sort-by=.lastTimestamp 2>&1 | tail -20 || true
	for pod in $(kubectl get pods -n "$ns" --no-headers 2>/dev/null |
		awk '{split($2, r, "/")} $3 != "Completed" && (r[1] != r[2] || $3 != "Running") {print $1}'); do
		echo "===== $pod"
		kubectl logs "$pod" -n "$ns" --all-containers --tail=30 2>&1 || true
	done
	echo "::endgroup::"
}

# A Recreate Deployment starts its new pod only once the old one is gone, and
# a draining pod may use its whole grace (collector: 360 s
# for in-flight publishes). The grace is added to each wait, or a healthy
# release whose drain outlasts the timeout would be rolled back (PR #460).
# Base timeout (180 s) measured in kind run 42498902230: forward rollout of the upgrade, slowest
# healthy Deployment 33 s (discovery-server drain), the others 1 to 5 s; plus each grace.
wait_rollout() {
	local ns="$1" base="${2%s}" dep grace
	[[ $base =~ ^[0-9]+$ ]] || {
		echo "deploy-release.sh: timeout must be in seconds (e.g. 180s), got $2" >&2
		return 64
	}
	base=$((base * FACTOR))
	# Redis first on a first deploy (an upgrade rolls it later, `redis-last`): a service
	# that starts before its nodes accept its ACL user only fails its readiness and burns its own timeout.
	for dep in $STATEFULSETS; do
		echo "Waiting for rollout of $dep (${base}s)..."
		if ! kubectl rollout status "statefulset/$dep" -n "$ns" --timeout="${base}s"; then
			echo "::error::Rollout of $dep failed or timed out"
			diagnose "$ns" "statefulset/$dep"
			return 1
		fi
	done
	for dep in $DEPLOYMENTS; do
		grace=$(kubectl get deployment "$dep" -n "$ns" \
			-o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}')
		echo "Waiting for rollout of $dep ($((base + ${grace:-30}))s)..."
		if ! kubectl rollout status "deployment/$dep" -n "$ns" --timeout="$((base + ${grace:-30}))s"; then
			echo "::error::Rollout of $dep failed or timed out"
			diagnose "$ns" "deployment/$dep"
			return 1
		fi
	done
}

# An OrderedReady StatefulSet waits for a pod of the failed revision to turn
# ready before replacing it, which a stuck pod never does (Kubernetes "forced
# rollback"). Once the controller has seen the undo, delete the pods that are
# not ready and not on the restored revision; ready pods are left to it.
replace_stuck_pods() {
	local ns="$1" sts="$2" gen upd pods
	gen=$(kubectl get "statefulset/$sts" -n "$ns" -o jsonpath='{.metadata.generation}') &&
		kubectl wait "statefulset/$sts" -n "$ns" --for=jsonpath='{.status.observedGeneration}'="$gen" --timeout="$((60 * FACTOR))s" &&
		upd=$(kubectl get "statefulset/$sts" -n "$ns" -o jsonpath='{.status.updateRevision}') && [ -n "$upd" ] &&
		pods=$(kubectl get pods -n "$ns" -l "app.kubernetes.io/component=$sts" \
			-o jsonpath='{range .items[*]}{.metadata.name} {.metadata.labels.controller-revision-hash} {.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}') ||
		return 1
	pods=$(awk -v upd="$upd" '$2 != upd && $3 != "True" {print $1}' <<<"$pods")
	# shellcheck disable=SC2086
	[ -z "$pods" ] || kubectl delete pod $pods -n "$ns"
}

# `rollout undo` restores the pod template but not last-applied-configuration: the next
# client-side apply then deletes nothing that N-1 had and N moved (spiffe-helper from
# containers to initContainers, issue #1337: "Duplicate value"). Align the containers.
resync_last_applied() {
	local ns="$1" dep="$2" ann='kubectl.kubernetes.io/last-applied-configuration' live new
	live=$(kubectl get deployment "$dep" -n "$ns" -o json) || return 1
	new=$(echo "$live" | jq -c --arg a "$ann" '. as $d | ($d.metadata.annotations[$a] // empty | fromjson)
		| .spec.template.spec.containers = $d.spec.template.spec.containers
		| if $d.spec.template.spec.initContainers then .spec.template.spec.initContainers = $d.spec.template.spec.initContainers
		  else del(.spec.template.spec.initContainers) end') || return 1
	[ -z "$new" ] || kubectl annotate deployment "$dep" -n "$ns" --overwrite "$ann=$new"
}

# Back to the revision recorded before the overlay: its pod template names
# the image digest and the hashed ConfigMaps of release N, which are still in
# the namespace (never pruned), so configuration comes back with the image
# (issue #410). Only Deployments and the Redis StatefulSets (first in the
# file) are rolled back: docs/deployment/DEPLOY.md lists what is not. Every deployment is tried: one without a previous
# revision (first deploy) must not leave the others on the failed release.
# Every undo is issued before any wait, as apply does: a Redis server rolled
# back alone restarts while the sentinels still name its old pod IP, waits for
# that dead master and fails its startup probe (PR #579).
rollback() {
	local ns="$1" file="$2" dep rev failed=0 target entry undone=() waited=0 unswapped=yes
	# The apply may have failed because the API server went down (run 43665338171): wait for it.
	until kubectl get deployments -n "$ns" >/dev/null; do
		[ "$waited" -lt $((300 * FACTOR)) ] || {
			echo "::error::API server unreachable for $waited s: nothing rolled back (configmap/$REVISIONS_CM kept for a re-run)"
			return 1
		}
		sleep 10
		waited=$((waited + 10))
	done
	redis_unswap "$ns" || {
		echo "::error::redis-0 did not take the master role back from redis-1: Redis left as is, not rolled back"
		failed=1
		unswapped=no
	}
	while read -r dep rev; do
		[[ $dep == statefulset/redis && $unswapped == no ]] && continue
		target="$dep"
		[[ $dep == */* ]] || target="deployment/$dep"
		if [ "$rev" = none ]; then
			# Created by this release: no N-1 revision to go back to, so remove it (the next apply recreates it).
			kubectl delete "$target" -n "$ns" --ignore-not-found || {
				echo "::error::Could not remove $dep: it did not exist before this deploy"
				failed=1
			}
		elif ! kubectl rollout undo "$target" -n "$ns" --to-revision="$rev"; then
			echo "::error::Could not roll back $dep to revision $rev"
			failed=1
		else
			if [[ $target == deployment/* ]] && ! resync_last_applied "$ns" "$dep"; then
				echo "::error::Could not resync last-applied-configuration of $dep"
				failed=1
			fi
			undone+=("$target $dep $rev")
		fi
	done <"$file"
	for entry in "${undone[@]}"; do
		read -r target dep rev <<<"$entry"
		if [[ $target == statefulset/* ]] && ! replace_stuck_pods "$ns" "${target#*/}"; then
			echo "::error::Could not replace the stuck pods of $dep"
			failed=1
		fi
		# 180 s: measured in kind run 42498902230 (PR #685): the whole rollback settled in 47 s, slowest
		# discovery-server at 33 s (drain). Kept: lowering it would also cut the real deploy.
		if ! kubectl rollout status "$target" -n "$ns" --timeout="$((180 * FACTOR))s"; then
			echo "::error::$dep did not finish rolling back to revision $rev"
			diagnose "$ns" "$target"
			failed=1
		fi
	done
	[ "$failed" = 1 ] || forget "$ns"
	return "$failed"
}

# A destructive migration cannot be undone by migrate-down or the rollback: this dump is the restore point.
# The Job runs the CronJob template of release N-1 (not applied yet): outside production its off-site
# copy may not work with this cluster's store (region fix of #2336, issue #2724), so it stays local.
pre_migrate_backup() {
	local ns="$1" job="$2" env="$3" filter=.
	if ! kubectl get statefulset mysql -n "$ns" >/dev/null 2>&1; then
		echo "First deploy: MySQL not there yet, no backup"
		return 0
	fi
	# The job needs the age recipients and the off-site Secret (BACKUP_REQUIRE_*): production
	# was checked before; elsewhere a missing one skips the backup instead of blocking the deploy.
	if [ "$env" != production ] && ! { kubectl get configmap backup-encryption -n "$ns" &&
		kubectl get secret trading-model-backup-s3 -n "$ns"; } >/dev/null 2>&1; then
		echo "::warning::$env has no backup-encryption ConfigMap or trading-model-backup-s3 Secret: pre-migration backup skipped"
		return 0
	fi
	# An env entry wins over envFrom; METRICS_FILE keeps the daily job's metrics.
	[ "$env" = production ] || filter='{BACKUP_S3_BUCKET: "", BACKUP_REQUIRE_OFFSITE: "false", METRICS_FILE: "/tmp/premigrate.prom"} as $o
		| .spec.template.spec.containers |= map(if .name == "backup"
			then .env = [(.env // [])[] | select($o[.name] == null)] + [$o | to_entries[] | {name: .key, value}] else . end)'
	kubectl create job "$job" --from=cronjob/db-backup -n "$ns" --dry-run=client -o json |
		sed 's/--components [a-z,]*/--components mysql/' | jq "$filter" |
		kubectl apply -n "$ns" -f - || return 1
	bash "$(dirname "$0")/wait-job.sh" "$ns" "$job" 1800 || return 1
	{
		echo "MySQL backup finished at $(date -u +%Y-%m-%dT%H:%M:%SZ) (job $job): restore point for restore-k8s.sh --until"
		[ "$env" = production ] || echo "$env: this restore point is local only (volume backup-data), not copied off-site"
	} >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
}

schema_check() {
	local ns="$1" dir="$2" applied unknown
	kubectl get statefulset mysql -n "$ns" >/dev/null 2>&1 || return 0
	applied=$(kubectl exec mysql-0 -n "$ns" -c mysql -- sh -c 'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "SELECT id FROM financial_scraper._migrations"') || return 1
	unknown=$(comm -23 <(tr -d '\r' <<<"$applied" | sort) <(cd "$dir" && ls | sed -n 's/\.up\.sql$//p' | sort))
	[ -z "$unknown" ] || {
		echo "::error::rollback refused: the live schema is newer than this release, it does not know: $(tr '\n' ' ' <<<"$unknown")(migrations are never undone automatically)" >&2
		return 1
	}
}

case "${1:-}" in
deployments) echo $DEPLOYMENTS ;;
pre-migrate-backup) [ $# -eq 4 ] || usage; pre_migrate_backup "$2" "$3" "$4" ;;
record) [ $# -eq 3 ] || usage; record "$2" "$3" ;;
release-replicas) [ $# -eq 2 ] || usage; release_replicas "$2" ;;
render) [ $# -ge 4 ] && [ $# -le 5 ] || usage; render "$2" "$3" "$4" "${5:-}" ;;
without-redis) [ $# -eq 2 ] || usage; without_redis "$2" ;;
redis-last) [ $# -eq 2 ] || usage; redis_last "$2" ;;
prepull) [ $# -eq 2 ] || usage; prepull "$2" ;;
dry-run) [ $# -eq 3 ] || usage; dry_run "$2" "$3" ;;
wait) [ $# -ge 2 ] || usage; wait_rollout "$2" "${3:-180s}" ;;
rollback) [ $# -eq 3 ] || usage; rollback "$2" "$3" ;;
schema-check) [ $# -eq 3 ] || usage; schema_check "$2" "$3" ;;
forget) [ $# -eq 2 ] || usage; forget "$2" ;;
*) usage ;;
esac
