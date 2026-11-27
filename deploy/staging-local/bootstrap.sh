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
#              (namespace sealed-secrets, ADR-0035), metrics-server (read by
#              the HPAs), the `rwx-csi` StorageClass and the volume of
#              tests/k8s/kind-fixtures.yaml.
#  identities  creates deploy-app / deploy-cluster (ADR-0041) with the API
#              server address the runner container sees on the `kind` network,
#              and stores both kubeconfigs in the GitHub environment `staging`.
#  rebuild <tag>  deletes and recreates the cluster from scratch, then restores the
#              SealedSecrets key, deploys <tag> and restores the newest MySQL/MongoDB
#              backup of the local MinIO. Run by the owner (cluster admin). Needs
#              BACKUP_AGE_RECIPIENTS, BACKUP_S3_BUCKET, AWS_* / RCLONE_S3_* (as
#              backup-sealed-secrets-key.sh) and the age identity of the backups
#              (BACKUP_AGE_IDENTITY, default ~/.trading-staging/backup-age-identity.txt).
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
METRICS_SERVER="v0.9.1"

kubectl config use-context "$CONTEXT" >/dev/null

prereqs() {
	kubectl apply -f "https://raw.githubusercontent.com/kubernetes/ingress-nginx/${INGRESS_NGINX}/deploy/static/provider/kind/deploy.yaml"
	kubectl apply -f "https://github.com/cert-manager/cert-manager/releases/download/${CERT_MANAGER}/cert-manager.yaml"
	kubectl apply -f "https://raw.githubusercontent.com/kubernetes/autoscaler/${VPA}/vertical-pod-autoscaler/deploy/vpa-v1-crd-gen.yaml"
	bash "$ROOT/scripts/install-sealed-secrets.sh"
	# kind kubelets serve a self-signed certificate: metrics-server cannot verify it.
	curl -fsSL "https://github.com/kubernetes-sigs/metrics-server/releases/download/${METRICS_SERVER}/components.yaml" |
		sed -E 's#^( *)- --cert-dir=/tmp$#&\n\1- --kubelet-insecure-tls#' | kubectl apply -f -
	# hostPath dirs are root:root and fsGroup skips hostPath: the trainer (uid 10001) must write (#1246).
	docker exec trading-staging-control-plane install -d -o 10001 -g 10001 /var/local/kind-rwx/trainer-checkpoints
	kubectl apply -f "$ROOT/tests/k8s/kind-fixtures.yaml"
	# No access log at the controller: it would hold the full caller IP, User-Agent
	# and Referer on the node (data-processing register, activity 6; issue #732).
	# The edge-proxy logs the truncated IP. The controller reloads on its own.
	kubectl -n ingress-nginx patch configmap ingress-nginx-controller --type merge \
		-p '{"data":{"disable-access-log":"true"}}'
	kubectl -n ingress-nginx rollout status deployment/ingress-nginx-controller --timeout=300s
	kubectl -n cert-manager rollout status deployment/cert-manager-webhook --timeout=300s
	kubectl wait --for=condition=Available apiservice/v1beta1.metrics.k8s.io --timeout=300s
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

rebuild() {
	local tag="${1:?usage: $0 rebuild <tag>}" cluster="${CONTEXT#kind-}" typed identity before run
	identity="${BACKUP_AGE_IDENTITY:-$HOME/.trading-staging/backup-age-identity.txt}"
	[[ -r $identity ]] || { echo "age identity $identity not readable" >&2; exit 1; }
	read -r -p "This DELETES the kind cluster '$cluster' (all its data). Type its name to go on: " typed
	[[ $typed == "$cluster" ]] || { echo "name does not match: nothing touched" >&2; exit 1; }
	# Key first, off-site: a failed backup must stop before the cluster is deleted.
	bash "$ROOT/scripts/backup-sealed-secrets-key.sh"
	kind delete cluster --name "$cluster"
	kind create cluster --config "$ROOT/deploy/staging-local/kind.yaml"
	docker update --memory 12g --memory-swap 12g --cpus 12 "${cluster}-control-plane" >/dev/null
	kubectl config use-context "$CONTEXT" >/dev/null
	prereqs
	identities
	bash "$ROOT/scripts/restore-sealed-secrets-key.sh" --identity "$identity" --offsite
	# Same workflow, same manifests as every staging release.
	list_runs() { gh run list --workflow deploy.yml --event workflow_dispatch --branch "$tag" --limit 1 --json databaseId -q '.[0].databaseId // 0'; }
	before="$(list_runs)"
	gh workflow run deploy.yml --ref "$tag" -f environment=staging -f image_tag="$tag"
	# The run we launched is the first id above the one seen before; bounded wait, explicit failure.
	run="$before"
	for _ in $(seq 30); do
		run="$(list_runs)"
		((run > before)) && break
		sleep 2
	done
	((run > before)) || { echo "deploy.yml run for $tag not found after 60 s" >&2; exit 1; }
	gh run watch "$run" --exit-status
	# Global on purpose: an EXIT trap runs after the function's locals are gone (set -u).
	DEST="$(mktemp -d)"
	trap 'rm -rf "$DEST"' EXIT
	bash "$ROOT/scripts/fetch-offsite.sh" --dest "$DEST"
	BACKUP_DIR="$DEST" BACKUP_AGE_IDENTITY="$identity" bash "$ROOT/scripts/restore-k8s.sh" --components mongodb-audit,mysql
	echo "Left to do on GitHub: check the environment 'staging' secrets (kubeconfigs are stored by identities; re-seal the overlay if the key was not restored), then run deploy.yml with preflight_only=true."
}

case "${1:-}" in
prereqs | identities) "$1" ;;
rebuild) shift; rebuild "$@" ;;
*)
	echo "usage: $0 prereqs|identities|rebuild <tag>" >&2
	exit 1
	;;
esac
