#!/usr/bin/env bash
# =============================================================================
#  Trading Model — Identity of the scheduled SealedSecrets key backup
#  Usage:  bash scripts/sealed-secrets-backup-identity.sh [--server URL] [--rotate] > kubeconfig
#          SEALED_SECRETS_NAMESPACE (default kube-system)
#          ... | gh secret set SEALED_SECRETS_BACKUP_KUBECONFIG --env sealed-secrets-key-backup
#
#  The workflow .github/workflows/sealed-secrets-key-backup.yml runs
#  scripts/backup-sealed-secrets-key.sh every day against the production
#  cluster (ADR-0035). It must not hold an admin kubeconfig: this script
#  creates, in the controller namespace, a ServiceAccount
#  `sealed-secrets-key-backup` with a Role that only allows `list` on Secrets
#  (what `kubectl get secret -l <label>` needs; no get, watch, write, nor any
#  other resource or namespace), a RoleBinding and a token Secret, then prints
#  a kubeconfig for that identity on stdout, to be piped straight into the
#  GitHub secret (never written to disk by this script).
#
#  RBAC cannot filter by label: the identity can list every Secret of the
#  controller namespace (ADR-0035, Consequences).
#
#  --server URL  API server address reachable from the runner (default: the
#                server of the current kubectl context)
#  --rotate      delete the token Secret first: the previous token stops
#                working, a new one is issued (rotation, suspected leak)
#  Run with an admin kubeconfig on the production cluster. Idempotent.
#  Exit 1 when kubectl fails, the context has no embedded CA, or no token is
#  issued within 60 s.
# =============================================================================

set -euo pipefail

NAMESPACE="${SEALED_SECRETS_NAMESPACE:-kube-system}"
NAME="sealed-secrets-key-backup"
SERVER=""
ROTATE=false

usage() {
	sed -n 4,6p "$0" | sed 's/^#  //'
}

while [[ $# -gt 0 ]]; do
	case "$1" in
	--server) SERVER="${2:-}"; shift 2 ;;
	--rotate) ROTATE=true; shift ;;
	-h | --help) usage; exit 0 ;;
	*) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
	esac
done

# stdout carries the kubeconfig only: every message goes to stderr.
log() { echo "[$(date +%H:%M:%S)] $*" >&2; }
fail() { log "✗ $*"; }

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

if [ "$ROTATE" = true ]; then
	log "Rotating: deleting the token Secret ${NAME}-token (the previous token stops working)"
	if ! kubectl -n "$NAMESPACE" delete secret "${NAME}-token" --ignore-not-found >&2; then
		fail "Cannot delete the token Secret"
		exit 1
	fi
fi

log "ServiceAccount, Role (list secrets), RoleBinding and token in ${NAMESPACE}"
if ! kubectl apply -f - >&2 <<EOF; then
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
automountServiceAccountToken: false
---
# list only: kubectl get secret -l sealedsecrets.bitnami.com/sealed-secrets-key
# (ADR-0035). The key Secrets have random names: no resourceNames possible.
apiVersion: rbac.authorization.k8s.io/v1
kind: Role
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
rules:
  - apiGroups: [""]
    resources: ["secrets"]
    verbs: ["list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: RoleBinding
metadata:
  name: ${NAME}
  namespace: ${NAMESPACE}
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: Role
  name: ${NAME}
subjects:
  - kind: ServiceAccount
    name: ${NAME}
    namespace: ${NAMESPACE}
---
apiVersion: v1
kind: Secret
metadata:
  name: ${NAME}-token
  namespace: ${NAMESPACE}
  annotations:
    kubernetes.io/service-account.name: ${NAME}
type: kubernetes.io/service-account-token
EOF
	fail "kubectl apply failed: an admin kubeconfig of the cluster is needed"
	exit 1
fi

# The token controller fills the Secret asynchronously.
TOKEN=""
for _ in $(seq 1 30); do
	if ! TOKEN_B64="$(kubectl -n "$NAMESPACE" get secret "${NAME}-token" -o 'jsonpath={.data.token}')"; then
		fail "Cannot read the token Secret ${NAME}-token"
		exit 1
	fi
	if [ -n "$TOKEN_B64" ]; then
		TOKEN="$(base64 -d <<<"$TOKEN_B64")"
		break
	fi
	sleep 2
done
if [ -z "$TOKEN" ]; then
	fail "No token issued for ${NAME} within 60 s"
	exit 1
fi

cat <<EOF
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
EOF
log "✓ kubeconfig of ${NAME} printed (list secrets in ${NAMESPACE} only)"
