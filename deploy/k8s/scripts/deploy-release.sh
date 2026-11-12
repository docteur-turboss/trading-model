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
#       `none` when it does not exist yet).
#   deploy-release.sh release-replicas <namespace>
#       Deletes retired HPAs and the finished Mongo init Jobs (immutable pod
#       template, recreated by the apply), then drops spec.replicas from
#       last-applied-configuration of HPA-driven Deployments (needs jq).
#   deploy-release.sh render <overlay-dir> <registry> <digests-file> [<tag>]
#       Prints the overlay with every first-party image pinned by digest
#       ("<image> <sha256:...>" per line); the caller pipes it to kubectl apply.
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
#       each rollout (180s); fails if any did not come back.
#
# DEPLOY_TIMEOUT_FACTOR: integer the wait and rollback timeouts are multiplied
# by (default 1; a slow cluster such as the local kind staging).
set -euo pipefail

FACTOR="${DEPLOY_TIMEOUT_FACTOR:-1}"
[[ $FACTOR =~ ^[1-9][0-9]*$ ]] || {
	echo "deploy-release.sh: DEPLOY_TIMEOUT_FACTOR must be a positive integer, got $FACTOR" >&2
	exit 64
}

# Deployments a release rolls out and a failed release rolls back.
DEPLOYMENTS="discovery-server message-manager financial-scraper financial-scraper-collector trader-trainer
  api-gateway audit-logger dlq-service edge-proxy"

# Redis and its sentinels: the services' credentials (ADR-0047) only work
# against the nodes of their own release, so these roll out and back too.
STATEFULSETS="redis redis-sentinel"

# Finished init Jobs `release-replicas` deletes before the apply (immutable pod template).
INIT_JOBS="mongo-audit-init mongo-dlq-init mysql-cluster-init mongo-audit-users mongo-dlq-users"

usage() {
	echo "usage: $0 record <ns> <file> | release-replicas <ns> | render <overlay-dir> <registry> <digests-file> | dry-run <ns> <node-agents-dir> | wait <ns> [timeout] | rollback <ns> <file>" >&2
	exit 64
}

# Revision each Deployment runs before the overlay: the rollback returns to
# exactly it (image and hashed ConfigMap), not to "the one before the
# current", which is older than N for a Deployment the overlay left as is.
record() {
	local ns="$1" file="$2" dep rev sts cr
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
}

# Deployments driven by an HPA carry no spec.replicas in the overlay. A
# client-side apply of a manifest that drops a field it applied before
# resets it to the default (1), so the field leaves
# last-applied-configuration first (Kubernetes docs, "Migrating
# Deployments and StatefulSets to horizontal autoscaling"). No-op once done
# and on a first deploy (no HPA yet).
release_replicas() {
	local ns="$1" ann='kubectl.kubernetes.io/last-applied-configuration' dep last
	# Retired HPAs: apply never prunes, and a live one would keep scaling its
	# Deployment. trader-trainer is a singleton (ADR-0044, issue #501).
	kubectl delete hpa/trader-trainer-hpa -n "$ns" --ignore-not-found
	# A Job's pod template is immutable: apply fails on a finished init Job
	# whose template changed (labels, issues #727 and #771). All are idempotent and
	# run again from the overlay.
	# shellcheck disable=SC2086
	kubectl delete job $INIT_JOBS -n "$ns" --ignore-not-found
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
	bash "$split" app <<<"$rendered" | awk -v jobs=" $INIT_JOBS " '
function flush() {
	if (doc != "" && !(kind == "Job" && index(jobs, " " name " "))) { printf "%s%s", sep, doc; sep = "---\n" }
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
# a draining pod may use its whole grace (collector and message-manager: 360 s
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
	# Redis first: a service that starts before its nodes accept its ACL user
	# only fails its readiness and burns its own timeout.
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

# Back to the revision recorded before the overlay: its pod template names
# the image digest and the hashed ConfigMaps of release N, which are still in
# the namespace (never pruned), so configuration comes back with the image
# (issue #410). Only Deployments and the Redis StatefulSets (first in the
# file) are rolled back: docs/deployment/DEPLOY.md lists what is not. Every deployment is tried: one without a previous
# revision (first deploy) must not leave the others on the failed release.
# Every undo is issued before any wait, as apply does: a Redis server rolled
# back alone restarts while the sentinels still name its old pod IP, waits for
# that dead master and fails its startup probe (PR #579).
# Release N makes MySQL refuse plain connections (require_secure_transport=ON,
# users bound to a client certificate, issue #767). The mysql StatefulSet is
# not rolled back, so pods of release N-1 (plain, no certificate) would never
# turn ready (readiness runs SELECT 1): lift both through the local socket,
# which TLS rules do not touch, before the undo. A mysqld restart re-applies
# the ON of group-replication.cnf; the next deploy binds the users again.
relax_mysql() {
	local ns="$1" pod
	# Not the label alone: the mysql-cluster-init Job pod carries it too (no mysql container).
	for pod in $(kubectl get pods -n "$ns" -l app.kubernetes.io/component=mysql -o name | grep -E "/mysql-[0-9]+$"); do
		kubectl exec -n "$ns" "$pod" -c mysql -- sh -c '
			m() { MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysql -uroot -N -e "$1"; }
			m "SET GLOBAL require_secure_transport=OFF"
			# Only the writable member can alter users (replicated to the others).
			if [ "$(m "SELECT @@super_read_only")" = 0 ]; then
				m "ALTER USER IF EXISTS \"scraper\"@\"%\", \"root\"@\"%\" REQUIRE NONE"
			fi' || return 1
	done
}

rollback() {
	local ns="$1" file="$2" dep rev failed=0 target entry undone=()
	relax_mysql "$ns" || {
		echo "::error::Could not lift the MySQL TLS requirement: pods of the previous release cannot connect"
		failed=1
	}
	while read -r dep rev; do
		target="$dep"
		[[ $dep == */* ]] || target="deployment/$dep"
		if [ "$rev" = none ]; then
			echo "::error::Could not roll back $dep: it did not exist before this deploy"
			failed=1
		elif ! kubectl rollout undo "$target" -n "$ns" --to-revision="$rev"; then
			echo "::error::Could not roll back $dep to revision $rev"
			failed=1
		else
			undone+=("$target $dep $rev")
		fi
	done <"$file"
	for entry in "${undone[@]}"; do
		read -r target dep rev <<<"$entry"
		# 180 s: measured in kind run 42498902230 (PR #685): the whole rollback settled in 47 s, slowest
		# discovery-server at 33 s (drain). Kept: lowering it would also cut the real deploy.
		if ! kubectl rollout status "$target" -n "$ns" --timeout="$((180 * FACTOR))s"; then
			echo "::error::$dep did not finish rolling back to revision $rev"
			diagnose "$ns" "$target"
			failed=1
		fi
	done
	return "$failed"
}

case "${1:-}" in
deployments) echo $DEPLOYMENTS ;;
record) [ $# -eq 3 ] || usage; record "$2" "$3" ;;
release-replicas) [ $# -eq 2 ] || usage; release_replicas "$2" ;;
render) [ $# -ge 4 ] && [ $# -le 5 ] || usage; render "$2" "$3" "$4" "${5:-}" ;;
dry-run) [ $# -eq 3 ] || usage; dry_run "$2" "$3" ;;
wait) [ $# -ge 2 ] || usage; wait_rollout "$2" "${3:-180s}" ;;
rollback) [ $# -eq 3 ] || usage; rollback "$2" "$3" ;;
*) usage ;;
esac
