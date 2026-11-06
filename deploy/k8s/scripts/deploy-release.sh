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
#       Drops spec.replicas from last-applied-configuration of HPA-driven
#       Deployments (needs jq).
#   deploy-release.sh render <overlay-dir> <registry> <digests-file>
#       Prints the overlay with every first-party image pinned by digest
#       ("<image> <sha256:...>" per line); the caller pipes it to kubectl apply.
#   deploy-release.sh wait <namespace> [timeout]
#       Waits for the rollout of every Deployment: timeout (default 180s) plus
#       the terminationGracePeriodSeconds of its pod template.
#   deploy-release.sh rollback <namespace> <revisions-file>
#       Returns every Deployment to the revision `record` wrote.
set -euo pipefail

# Deployments a release rolls out and a failed release rolls back.
DEPLOYMENTS="discovery-server message-manager financial-scraper financial-scraper-collector trader-trainer
  api-gateway audit-logger dlq-service edge-proxy"

usage() {
	echo "usage: $0 record <ns> <file> | release-replicas <ns> | render <overlay-dir> <registry> <digests-file> | wait <ns> [timeout] | rollback <ns> <file>" >&2
	exit 64
}

# Revision each Deployment runs before the overlay: the rollback returns to
# exactly it (image and hashed ConfigMap), not to "the one before the
# current", which is older than N for a Deployment the overlay left as is.
record() {
	local ns="$1" file="$2" dep rev
	for dep in $DEPLOYMENTS; do
		rev=$(kubectl get deployment "$dep" -n "$ns" --ignore-not-found \
			-o jsonpath='{.metadata.annotations.deployment\.kubernetes\.io/revision}')
		echo "$dep ${rev:-none}"
	done | tee "$file"
}

# Deployments driven by an HPA carry no spec.replicas in the overlay. A
# client-side apply of a manifest that drops a field it applied before
# resets it to the default (1), so the field leaves
# last-applied-configuration first (Kubernetes docs, "Migrating
# Deployments and StatefulSets to horizontal autoscaling"). No-op once done
# and on a first deploy (no HPA yet).
release_replicas() {
	local ns="$1" ann='kubectl.kubernetes.io/last-applied-configuration' dep last
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
render() {
	local overlay="$1" registry="$2" digests="$3" img digest
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
	kubectl kustomize --load-restrictor LoadRestrictionsNone "$wrapper"
}

# A Recreate Deployment starts its new pod only once the old one is gone, and
# a draining pod may use its whole grace (collector and message-manager: 360 s
# for in-flight publishes). The grace is added to each wait, or a healthy
# release whose drain outlasts the timeout would be rolled back (PR #460).
wait_rollout() {
	local ns="$1" base="${2%s}" dep grace
	[[ $base =~ ^[0-9]+$ ]] || {
		echo "deploy-release.sh: timeout must be in seconds (e.g. 180s), got $2" >&2
		return 64
	}
	for dep in $DEPLOYMENTS; do
		grace=$(kubectl get deployment "$dep" -n "$ns" \
			-o jsonpath='{.spec.template.spec.terminationGracePeriodSeconds}')
		echo "Waiting for rollout of $dep ($((base + ${grace:-30}))s)..."
		if ! kubectl rollout status "deployment/$dep" -n "$ns" --timeout="$((base + ${grace:-30}))s"; then
			echo "::error::Rollout of $dep failed or timed out"
			return 1
		fi
	done
}

# Back to the revision recorded before the overlay: its pod template names
# the image digest and the hashed ConfigMaps of release N, which are still in
# the namespace (never pruned), so configuration comes back with the image
# (issue #410). Only Deployments are rolled back: docs/deployment/DEPLOY.md
# lists what is not. Every deployment is tried: one without a previous
# revision (first deploy) must not leave the others on the failed release.
rollback() {
	local ns="$1" file="$2" dep rev failed=0
	while read -r dep rev; do
		if [ "$rev" = none ]; then
			echo "::error::Could not roll back $dep: it did not exist before this deploy"
			failed=1
		elif ! kubectl rollout undo "deployment/$dep" -n "$ns" --to-revision="$rev"; then
			echo "::error::Could not roll back $dep to revision $rev"
			failed=1
		fi
	done <"$file"
	return "$failed"
}

case "${1:-}" in
deployments) echo $DEPLOYMENTS ;;
record) [ $# -eq 3 ] || usage; record "$2" "$3" ;;
release-replicas) [ $# -eq 2 ] || usage; release_replicas "$2" ;;
render) [ $# -eq 4 ] || usage; render "$2" "$3" "$4" ;;
wait) [ $# -ge 2 ] || usage; wait_rollout "$2" "${3:-180s}" ;;
rollback) [ $# -eq 3 ] || usage; rollback "$2" "$3" ;;
*) usage ;;
esac
