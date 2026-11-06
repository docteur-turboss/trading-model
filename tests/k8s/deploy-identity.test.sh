#!/usr/bin/env bash
# scripts/deploy-identity.sh and scripts/split-cluster-scope.sh against a stub
# `kubectl` (ADR-0041). Checks: the app identity gets a namespaced Role and
# RoleBinding only, never a ClusterRole(Binding); the cluster identity gets the
# ClusterRole, the ClusterRoles of the overlays (applied by the admin, never by
# the identity) and the Roles of the node-agents / controller namespaces; the
# token is bounded (`create token --duration`), never a token Secret; --revoke
# deletes the ServiceAccount first; bad input exits 1; stdout holds the
# kubeconfig only; the overlay splits into cluster-scope and application parts
# with nothing lost.
#   bash tests/k8s/deploy-identity.test.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
pass() { echo "  ✓ $*"; }
failed() { echo "  ✗ $*"; FAILED=1; }

mkdir "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >>"$STUB_LOG"
case "$*" in
"config view"*"server}") printf 'https://api.example:6443' ;;
"config view"*"certificate-authority-data}") printf 'Q0E=' ;;
*"create token"*) printf 'bounded-token' ;;
"kustomize "*) printf 'apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: overlay-role
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: overlay-binding
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: overlay-deployment
' ;;
"apply -f -"*) cat >>"$STUB_LOG" ;;
"-n "*"apply -f -"*) cat >>"$STUB_LOG" ;;
esac
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log"
run() { : >"$STUB_LOG"; bash "$ROOT/scripts/deploy-identity.sh" "$@" >"$WORK/out" 2>"$WORK/err"; }

# rbac_escalation FILE: rules of a flow-style role file that let the holder
# grant itself more (review of PR #481: `bind` + create clusterrolebindings
# reached nodes/proxy on kind). Prints "resources verbs" per offending rule.
rbac_escalation() {
	awk '
	function check() {
		if (verbs == "") return
		if (verbs ~ /(^|[ ,\[])(bind|escalate|impersonate|\*)[],]/ ||
			(res ~ /(clusterroles|clusterrolebindings|roles|rolebindings)/ && verbs ~ /(create|update|patch|delete|deletecollection)/))
			print res, verbs
		res = ""; verbs = ""
	}
	/^ *- apiGroups:/ { check() }
	/^ *resources:/ { res = $0 }
	/^ *verbs:/ { verbs = $0 }
	END { check() }
	' "$1"
}

echo "app identity"
run app --namespace prod-ns --duration 24h
grep -q 'token: bounded-token' "$WORK/out" && pass "kubeconfig on stdout" || failed "no token in kubeconfig"
grep -q 'create token deploy-app --duration 24h' "$STUB_LOG" && pass "token bounded by --duration" || failed "token not bounded"
grep -q -- "-n prod-ns apply -f $ROOT/deploy/k8s/deploy-identity/app-role.yaml" "$STUB_LOG" && pass "app Role applied in the namespace" || failed "app Role not applied"
grep -q 'kind: RoleBinding' "$STUB_LOG" && pass "RoleBinding" || failed "no RoleBinding"
! grep -q 'ClusterRole\|cluster-role.yaml\|service-account-token' "$STUB_LOG" && pass "no cluster-scope right, no token Secret" || failed "app identity touches cluster scope"
[ "$(grep -c '^apiVersion: v1' "$WORK/out")" = 1 ] && ! grep -q '^\[' "$WORK/out" && pass "stdout is the kubeconfig only" || failed "stdout polluted"

echo "cluster identity"
run cluster --revoke
grep -q 'delete serviceaccount deploy-cluster' "$STUB_LOG" && pass "--revoke deletes the ServiceAccount" || failed "no revoke"
grep -q "apply -f $ROOT/deploy/k8s/deploy-identity/cluster-role.yaml" "$STUB_LOG" && pass "ClusterRole applied" || failed "no ClusterRole"
grep -q 'kind: ClusterRoleBinding' "$STUB_LOG" && pass "ClusterRoleBinding" || failed "no ClusterRoleBinding"
grep -q -- '-n trading-model-node apply -f .*node-role.yaml' "$STUB_LOG" && pass "node-agents Role" || failed "no node-agents Role"
grep -q 'create token deploy-cluster --duration 168h' "$STUB_LOG" && pass "default duration 168h" || failed "no default duration"
grep -q "kustomize .*overlays/production/node-agents" "$STUB_LOG" && pass "default environment production" || failed "production overlays not rendered"
grep -q 'name: overlay-role' "$STUB_LOG" && grep -q 'name: overlay-binding' "$STUB_LOG" && ! grep -q 'name: overlay-deployment' "$STUB_LOG" && pass "overlay ClusterRoles and bindings applied by the admin, nothing else" || failed "overlay RBAC not applied alone"
escalation_right=$(rbac_escalation "$ROOT/deploy/k8s/deploy-identity/cluster-role.yaml")
[ -z "$escalation_right" ] && pass "deploy-cluster cannot grant itself a right (no bind/escalate/impersonate, read-only cluster RBAC)" || failed "deploy-cluster can escalate: $escalation_right"
printf 'rules:
  - apiGroups: [rbac.authorization.k8s.io]
    resources: [clusterroles]
    resourceNames: [spire-agent]
    verbs: [bind]
  - apiGroups: [rbac.authorization.k8s.io]
    resources: [clusterrolebindings]
    verbs: [get, create]
' >"$WORK/bad-role.yaml"
[ "$(rbac_escalation "$WORK/bad-role.yaml" | wc -l)" = 2 ] && pass "escalation check catches bind and a binding create" || failed "escalation check misses: $(rbac_escalation "$WORK/bad-role.yaml")"
run cluster --environment staging
grep -q "kustomize .*overlays/staging\$" "$STUB_LOG" && grep -q "kustomize .*overlays/staging/node-agents" "$STUB_LOG" && pass "--environment selects the overlays" || failed "--environment ignored"

echo "refusals"
run bogus && failed "unknown mode accepted" || pass "unknown mode exits 1"
run app --namespace kube-system && failed "kube-system accepted" || pass "kube-system refused"
run app --nope && failed "unknown option accepted" || pass "unknown option exits 1"
run cluster --environment dev && failed "unknown environment accepted" || pass "unknown environment exits 1"

echo "scope split"
cat >"$WORK/render.yaml" <<'YAML'
apiVersion: v1
kind: Namespace
metadata:
  name: n
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: d
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: c
---
apiVersion: v1
kind: Service
metadata:
  name: s
YAML
cluster="$(bash "$ROOT/scripts/split-cluster-scope.sh" cluster <"$WORK/render.yaml" | grep '^kind:' | tr '\n' ' ')"
app="$(bash "$ROOT/scripts/split-cluster-scope.sh" app <"$WORK/render.yaml" | grep '^kind:' | tr '\n' ' ')"
[ "$cluster" = "kind: Namespace kind: ClusterRole " ] && pass "cluster part" || failed "cluster part: $cluster"
[ "$app" = "kind: Deployment kind: Service " ] && pass "app part" || failed "app part: $app"

exit "$FAILED"
