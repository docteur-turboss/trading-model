#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Admin bootstrap of the local staging cluster (kind)
#  Usage:  bash deploy/staging-local/bootstrap.sh prereqs     # once per cluster
#          bash deploy/staging-local/bootstrap.sh identities  # once, then before the tokens expire (168 h)
#
#  prereqs     installs what deploy.yml's "Check cluster prerequisites" asks of
#              the staging-local overlay and kind lacks: ingress-nginx (kind
#              provider), cert-manager + the self-signed ClusterIssuer
#              `selfsigned-local`, the VPA CRD, the Sealed Secrets controller
#              (namespace sealed-secrets, ADR-0035), the `rwx-csi` StorageClass
#              and the volume of tests/k8s/kind-fixtures.yaml.
#  identities  creates deploy-app / deploy-cluster (ADR-0041) with the API
#              server address the runner container sees on the `kind` network,
#              and stores both kubeconfigs in the GitHub environment `staging`.
#
#  Runs with the kind admin context (kind-trading-staging). See
#  docs/deployment/STAGING_LOCAL.md.
# =============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CONTEXT="kind-trading-staging"
NS="trading-model-staging"
# Address of the API server inside the `kind` Docker network (runner container).
SERVER="https://trading-staging-control-plane:6443"
INGRESS_NGINX="controller-v1.15.1"
CERT_MANAGER="v1.21.3"
VPA="vertical-pod-autoscaler-1.8.1"

kubectl config use-context "$CONTEXT" >/dev/null

prereqs() {
	kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX}/deploy/static/provider/kind/deploy.yaml"
	kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER}/cert-manager.yaml"
	kubectl apply -f "https://raw.githubusercontent.com/kubernetes/autoscaler/${VPA}/vertical-pod-autoscaler/deploy/vpa-v1-crd-gen.yaml"
	bash "$ROOT/scripts/install-sealed-secrets.sh"
	kubectl apply -f "$ROOT/tests/k8s/kind-fixtures.yaml"
	kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=300s
	kubectl -n cert-manager rollout status deployment/cert-manager-webhook --timeout=300s
	kubectl apply -f - <<'EOF'
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: selfsigned-local
spec:
  selfSigned: {}
---
# kind-fixtures.yaml binds the trainer checkpoints PVC to a static volume of
# this class; check-prereqs.sh still wants the class itself.
apiVersion: storage.k8s.io/v1
kind: StorageClass
metadata:
  name: rwx-csi
provisioner: kubernetes.io/no-provisioner
volumeBindingMode: WaitForFirstConsumer
EOF
}

identities() {
	command -v gh >/dev/null || { echo "gh CLI required" >&2; exit 1; }
	kubectl get namespace "$NS" >/dev/null 2>&1 || kubectl create namespace "$NS"
	# Into variables first: a failed script must not store an empty secret.
	local app cluster
	app="$(cd "$ROOT" && bash scripts/deploy-identity.sh app --namespace "$NS" --server "$SERVER")"
	cluster="$(cd "$ROOT" && bash scripts/deploy-identity.sh cluster --namespace "$NS" --environment staging-local --server "$SERVER")"
	base64 -w0 <<<"$app" | gh secret set KUBECONFIG_STAGING_APP --env staging
	base64 -w0 <<<"$cluster" | gh secret set KUBECONFIG_STAGING_CLUSTER --env staging
	echo "KUBECONFIG_STAGING_APP / KUBECONFIG_STAGING_CLUSTER stored (token 168 h: run again before expiry)"
}

case "${1:-}" in
prereqs | identities) "$1" ;;
*)
	echo "usage: $0 prereqs|identities" >&2
	exit 1
	;;
esac
