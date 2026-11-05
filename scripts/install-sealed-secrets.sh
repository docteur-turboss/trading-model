#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Install the Sealed Secrets controller in its own namespace
#  Usage:  bash scripts/install-sealed-secrets.sh [--dry-run]
#          SEALED_SECRETS_NAMESPACE (default sealed-secrets)
#
#  Installs the upstream controller v0.27.1 (controller.yaml of
#  bitnami-labs/sealed-secrets, sha256 pinned) in the namespace
#  `sealed-secrets` instead of kube-system (ADR-0035). The daily key backup
#  lists the Secrets of the controller namespace and RBAC cannot filter by
#  label: in a namespace of its own, the backup identity reads the controller
#  keys and its own token only, never the other Secrets of kube-system
#  (API server serving key, node passwords of k3s).
#
#  The namespaced objects of controller.yaml are moved by kustomize
#  (`namespace:`), ClusterRoleBinding subjects included; the CRD and the
#  ClusterRole are cluster-wide and keep their names. The namespace comes
#  from deploy/k8s/sealed-secrets/namespace.yaml (Pod Security `restricted`).
#  Restore the keys first in a new cluster (scripts/restore-sealed-secrets-key.sh):
#  the controller then starts with them. A cluster whose controller runs in
#  kube-system: docs/deployment/sealed-secrets.md, "Move the controller out
#  of kube-system".
#
#  --dry-run  print the rendered manifests, apply nothing
#  Idempotent. Exit 1 when the download or its checksum fails, kubectl fails,
#  or the controller is not ready within 180 s. Needs kubectl, curl, sha256sum.
# =============================================================================

set -euo pipefail

NAMESPACE="${SEALED_SECRETS_NAMESPACE:-sealed-secrets}"
VERSION="0.27.1"
CONTROLLER_URL="https://github.com/bitnami-labs/sealed-secrets/releases/download/v${VERSION}/controller.yaml"
CONTROLLER_SHA256="f0616f1c05e331855162f4a214ddd2b49cb52979a5837dd4bda2b8fcac8fb2da"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DRY_RUN=false

usage() {
	sed -n 4,5p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--dry-run) DRY_RUN=true; shift ;;
	-h | --help) usage; exit 0 ;;
	*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
	esac
done

log() { echo "[$(date +%H:%M:%S)] $*" >&2; }
fail() { log "✗ $*"; }

if [ "$NAMESPACE" = kube-system ]; then
	fail "Refused: the controller must not run in kube-system (ADR-0035)"
	exit 1
fi
for tool in kubectl curl sha256sum; do
	if ! command -v "$tool" >/dev/null; then
		fail "${tool} is not installed"
		exit 1
	fi
done

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
if ! curl -fsSLo "$WORK/controller.yaml" "$CONTROLLER_URL"; then
	fail "Cannot download ${CONTROLLER_URL}"
	exit 1
fi
if ! (cd "$WORK" && echo "${CONTROLLER_SHA256}  controller.yaml" | sha256sum -c - >/dev/null); then
	fail "controller.yaml v${VERSION} does not match its pinned sha256: nothing applied"
	exit 1
fi
sed "s/^  name: sealed-secrets$/  name: ${NAMESPACE}/" "$ROOT/deploy/k8s/sealed-secrets/namespace.yaml" >"$WORK/namespace.yaml"
cat >"$WORK/kustomization.yaml" <<KUSTOMIZATION
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: ${NAMESPACE}
resources:
  - namespace.yaml
  - controller.yaml
KUSTOMIZATION
if ! kubectl kustomize "$WORK" >"$WORK/rendered.yaml"; then
	fail "kustomize failed on controller.yaml"
	exit 1
fi
if grep -q 'namespace: kube-system' "$WORK/rendered.yaml"; then
	fail "the rendered manifests still reference kube-system: nothing applied"
	exit 1
fi
if [ "$DRY_RUN" = true ]; then
	cat "$WORK/rendered.yaml"
	exit 0
fi

log "Installing the Sealed Secrets controller v${VERSION} in ${NAMESPACE}"
if ! kubectl apply -f "$WORK/rendered.yaml" >&2; then
	fail "kubectl apply failed: an admin kubeconfig of the cluster is needed"
	exit 1
fi
if ! kubectl -n "$NAMESPACE" rollout status deployment sealed-secrets-controller --timeout=180s >&2; then
	fail "${NAMESPACE}/sealed-secrets-controller is not ready"
	exit 1
fi
log "✓ Controller ready in ${NAMESPACE}. Seal with: kubeseal --controller-namespace ${NAMESPACE} (or SEALED_SECRETS_CONTROLLER_NAMESPACE=${NAMESPACE})"
