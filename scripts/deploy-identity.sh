#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Least-privilege identities of deploy.yml (ADR-0041)
#  Usage:  bash scripts/deploy-identity.sh app|cluster [--namespace NS] [--environment ENV] [--server URL] [--duration 168h] [--revoke] > kubeconfig
#          ... | base64 -w0 | gh secret set KUBECONFIG_PRODUCTION_APP --env production     (app)
#          ... | base64 -w0 | gh secret set KUBECONFIG_PRODUCTION_CLUSTER --env production (cluster)
#
#  app      ServiceAccount `deploy-app` in the application namespace, bound to
#           the Role of deploy/k8s/deploy-identity/app-role.yaml: applies the
#           overlay, migrations, rollout, smoke test, rollback. No cluster-scope
#           right, no other namespace.
#  cluster  ServiceAccount `deploy-cluster` (same namespace) bound to the
#           ClusterRole cluster-role.yaml (namespaces, the CSIDriver, the CRD
#           check, read-only on the overlay ClusterRoles and their bindings) and to Roles in the
#           node-agents namespace and in the Sealed Secrets controller
#           namespace. Used by the cluster-scope steps of deploy.yml only.
#           The script also applies, as admin, the ClusterRoles and
#           ClusterRoleBindings of the overlays of --environment (spire-server,
#           spire-agent, promtail): the identity may read them, never create,
#           change or bind them. Run it again when a release changes one.
#
#  The kubeconfig carries a bounded token (`kubectl create token --duration`),
#  never a permanent service-account-token Secret: it expires by itself, run
#  the script again before the end to renew it. The API server may cap the
#  duration. stdout carries the kubeconfig only, nothing is written to disk.
#
#  --namespace NS        application namespace (default trading-model)
#  --node-namespace NS   node-agents namespace (default trading-model-node)
#  --sealed-namespace NS Sealed Secrets controller namespace (default sealed-secrets)
#  --environment ENV     overlay whose ClusterRoles and bindings are applied, cluster mode
#                        (deploy/k8s/overlays/ENV and ENV/node-agents; default production)
#  --server URL          API server address reachable from the runner (default:
#                        the server of the current kubectl context)
#  --duration D          token lifetime (default 168h)
#  --revoke              delete the ServiceAccount first: every token issued
#                        before stops working at once (suspected leak)
#  Run with an admin kubeconfig. Idempotent. Exit 1 on a bad argument, kubectl
#  failure, or a context without embedded CA.
# =============================================================================

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RBAC="$ROOT/deploy/k8s/deploy-identity"
MODE="${1:-}"
[ $# -gt 0 ] && shift
NAMESPACE=trading-model
NODE_NAMESPACE=trading-model-node
SEALED_NAMESPACE=sealed-secrets
ENVIRONMENT=production
SERVER=""
DURATION=168h
REVOKE=false

usage() { sed -n 4,5p "$0" | sed 's/^#  //'; }
log() { echo "[$(date +%H:%M:%S)] $*" >&2; }
fail() { log "✗ $*"; }

while [[ $# -gt 0 ]]; do
	case "$1" in
	--namespace) NAMESPACE="${2:-}"; shift 2 ;;
	--node-namespace) NODE_NAMESPACE="${2:-}"; shift 2 ;;
	--sealed-namespace) SEALED_NAMESPACE="${2:-}"; shift 2 ;;
	--environment) ENVIRONMENT="${2:-}"; shift 2 ;;
	--server) SERVER="${2:-}"; shift 2 ;;
	--duration) DURATION="${2:-}"; shift 2 ;;
	--revoke) REVOKE=true; shift ;;
	-h | --help) usage; exit 0 ;;
	*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
	esac
done

case "$MODE" in
app | cluster) NAME="deploy-$MODE" ;;
*) usage >&2; exit 1 ;;
esac
if [ -z "$NAMESPACE" ] || [ "$NAMESPACE" = kube-system ]; then
	fail "Refused namespace '${NAMESPACE}': give the application namespace"
	exit 1
fi
case "$ENVIRONMENT" in
staging | production) ;;
*) fail "Unknown environment '${ENVIRONMENT}': staging or production"; exit 1 ;;
esac
if ! command -v kubectl >/dev/null; then
	fail "kubectl is not installed"
	exit 1
fi
if [ -z "$SERVER" ] && ! SERVER="$(kubectl config view --minify --raw -o 'jsonpath={.clusters[0].cluster.server}')"; then
	fail "Cannot read the current kubectl context"
	exit 1
fi
if ! CA="$(kubectl config view --minify --raw -o 'jsonpath={.clusters[0].cluster.certificate-authority-data}')"; then
	fail "Cannot read the current kubectl context"
	exit 1
fi
if [ -z "$SERVER" ] || [ -z "$CA" ]; then
	fail "The current context has no server or no embedded CA (certificate-authority-data): use kubectl config view --raw --flatten, or --server"
	exit 1
fi

ensure_namespace() {
	kubectl get namespace "$1" >/dev/null 2>&1 || kubectl create namespace "$1" >&2
}

# bind_role ROLE NAMESPACE / bind_clusterrole ROLE: bind the identity.
bind_role() {
	kubectl apply -f - >&2 <<YAML
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${NAME}-$1
  namespace: $2
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: $1
subjects:
  - kind: ServiceAccount
    name: ${NAME}
    namespace: ${NAMESPACE}
YAML
}

bind_clusterrole() {
	kubectl apply -f - >&2 <<YAML
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: ${NAME}-$1
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: $1
subjects:
  - kind: ServiceAccount
    name: ${NAME}
    namespace: ${NAMESPACE}
YAML
}

ensure_namespace "$NAMESPACE"
if [ "$REVOKE" = true ]; then
	log "Revoking: deleting the ServiceAccount ${NAME} (every token issued so far stops working)"
	kubectl -n "$NAMESPACE" delete serviceaccount "$NAME" --ignore-not-found >&2
fi
log "ServiceAccount ${NAME} in ${NAMESPACE}"
kubectl -n "$NAMESPACE" apply -f - >&2 <<YAML
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${NAME}
automountServiceAccountToken: false
YAML

if [ "$MODE" = app ]; then
	kubectl -n "$NAMESPACE" apply -f "$RBAC/app-role.yaml" >&2
	bind_role deploy-app "$NAMESPACE"
else
	kubectl apply -f "$RBAC/cluster-role.yaml" >&2
	bind_clusterrole deploy-cluster
	log "ClusterRoles and ClusterRoleBindings of the ${ENVIRONMENT} overlays (deploy-cluster may only read them)"
	{
		kubectl kustomize --load-restrictor LoadRestrictionsNone "$ROOT/deploy/k8s/overlays/$ENVIRONMENT"
		echo ---
		kubectl kustomize "$ROOT/deploy/k8s/overlays/$ENVIRONMENT/node-agents"
	} | awk '
		function flush() { if (kind == "ClusterRole" || kind == "ClusterRoleBinding") { printf "%s%s", sep, doc; sep = "---\n" } doc = ""; kind = "" }
		/^---[ \t]*$/ { flush(); next }
		/^kind:[ \t]/ && kind == "" { kind = $2 }
		{ doc = doc $0 "\n" }
		END { flush() }
	' | kubectl apply -f - >&2
	ensure_namespace "$NODE_NAMESPACE"
	kubectl -n "$NODE_NAMESPACE" apply -f "$RBAC/node-role.yaml" >&2
	bind_role deploy-node-agents "$NODE_NAMESPACE"
	if kubectl get namespace "$SEALED_NAMESPACE" >/dev/null 2>&1; then
		kubectl -n "$SEALED_NAMESPACE" apply -f "$RBAC/sealed-secrets-role.yaml" >&2
		bind_role deploy-check-controller "$SEALED_NAMESPACE"
	else
		log "Namespace ${SEALED_NAMESPACE} absent: no controller check right (production refuses to deploy without the controller; run this script again after installing it)"
	fi
fi

if ! TOKEN="$(kubectl -n "$NAMESPACE" create token "$NAME" --duration "$DURATION")" || [ -z "$TOKEN" ]; then
	fail "No token issued for ${NAME} (duration ${DURATION}: the API server may cap it)"
	exit 1
fi

cat <<YAML
apiVersion: v1
kind: Config
clusters:
  - name: trading-model
    cluster:
      server: ${SERVER}
      certificate-authority-data: ${CA}
users:
  - name: ${NAME}
    user:
      token: ${TOKEN}
contexts:
  - name: ${NAME}
    context:
      cluster: trading-model
      user: ${NAME}
      namespace: ${NAMESPACE}
current-context: ${NAME}
YAML
log "✓ kubeconfig of ${NAME} printed (token valid ${DURATION})"
