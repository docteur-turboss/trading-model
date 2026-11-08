#!/usr/bin/env bash
# deploy/k8s/scripts/check-cluster-rbac.sh (issue #701) with a stub kubectl
# that serves only get (the deploy-cluster identity): a ClusterRole of the
# render missing from the cluster, one that differs, all identical, any other
# API error, and never a write.
#   bash tests/k8s/check-cluster-rbac.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK="$ROOT/deploy/k8s/scripts/check-cluster-rbac.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }

mkdir -p "$WORK/bin" "$WORK/live"
# `create --dry-run=client -o json` prints $STUB_DESIRED (kubectl's own YAML to
# JSON conversion); `get <Kind> <name> -o json` prints $WORK/live/<Kind>_<name>.json
# or NotFound; $STUB_GET_ERROR replaces every get with that error.
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
echo "kubectl $*" >>"$STUB_LOG"
case "$1" in
create) [[ " $* " == *" --dry-run=client "* ]] || exit 3; cat >/dev/null; printf '%s' "$STUB_DESIRED" ;;
get)
	[ -z "${STUB_GET_ERROR:-}" ] || { echo "$STUB_GET_ERROR" >&2; exit 1; }
	f="$STUB_LIVE/$2_$3.json"
	[ -f "$f" ] && cat "$f" || { echo "Error from server (NotFound): clusterroles.rbac.authorization.k8s.io \"$3\" not found" >&2; exit 1; } ;;
*) exit 3 ;;
esac
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH" STUB_LOG="$WORK/log" STUB_LIVE="$WORK/live"

RENDER='apiVersion: v1
kind: Namespace
metadata:
  name: trading-model-staging
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: prometheus-nodes
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: prometheus-nodes'
ROLE='{"apiVersion":"rbac.authorization.k8s.io/v1","kind":"ClusterRole","metadata":{"name":"prometheus-nodes"},"rules":[{"apiGroups":[""],"resources":["nodes/metrics"],"verbs":["get"]}]}'
BINDING='{"apiVersion":"rbac.authorization.k8s.io/v1","kind":"ClusterRoleBinding","metadata":{"name":"prometheus-nodes"},"roleRef":{"apiGroup":"rbac.authorization.k8s.io","kind":"ClusterRole","name":"prometheus-nodes"},"subjects":[{"kind":"ServiceAccount","name":"prometheus","namespace":"trading-model-staging"}]}'
export STUB_DESIRED="$ROLE
$BINDING"
# live objects as the API server returns them: metadata, apiGroup defaulted on the subject
live_role() { jq '.metadata += {uid: "u1", resourceVersion: "7"}' <<<"${1:-$ROLE}" >"$WORK/live/ClusterRole_prometheus-nodes.json"; }
live_binding() { jq '.metadata.uid = "u2" | .subjects[0].apiGroup = ""' <<<"$BINDING" >"$WORK/live/ClusterRoleBinding_prometheus-nodes.json"; }

check() { # env -> output; status in $rc
	: >"$STUB_LOG"
	rc=0; out=$(bash "$CHECK" --namespace trading-model-staging --environment "$1" <<<"$RENDER" 2>&1) || rc=$?
}
no_write() { ! grep -vE '^kubectl (get |create --dry-run=client )' "$STUB_LOG"; } # only reads

# 1. ClusterRole and binding absent (v3.1.0 prometheus-nodes on trading-staging)
check staging
[ $rc = 1 ] && ok "missing ClusterRole refused" || ko "missing ClusterRole: rc=$rc $out"
[[ $out == *"::error::"*"ClusterRole prometheus-nodes (missing)"*"ClusterRoleBinding prometheus-nodes (missing)"* ]] && ok "names the missing objects" || ko "objects not named: $out"
[[ $out == *"bash scripts/deploy-identity.sh cluster --namespace trading-model-staging --environment staging"* ]] && ok "gives the deploy-identity.sh command" || ko "no admin command: $out"
[[ $out != *"Namespace"* ]] && ok "non-RBAC kinds ignored" || ko "Namespace listed: $out"
no_write && ok "nothing written" || ko "write attempted: $(cat "$STUB_LOG")"
check staging-local
[[ $out == *"bash deploy/staging-local/bootstrap.sh identities"* ]] && ok "staging-local: gives bootstrap.sh identities" || ko "staging-local: $out"

# 2. present but the rules differ
live_role '{"apiVersion":"rbac.authorization.k8s.io/v1","kind":"ClusterRole","metadata":{"name":"prometheus-nodes"},"rules":[{"apiGroups":[""],"resources":["nodes/proxy"],"verbs":["get"]}]}'
live_binding
check production
[ $rc = 1 ] && [[ $out == *"ClusterRole prometheus-nodes (differs)"* && $out != *"ClusterRoleBinding prometheus-nodes"* ]] && ok "different rules refused, binding accepted" || ko "differs: rc=$rc $out"

# 3. all present and identical
live_role
check production
[ $rc = 0 ] && [[ $out == *"up to date"* ]] && ok "identical objects pass" || ko "identical: rc=$rc $out"
no_write && ok "nothing written" || ko "write attempted: $(cat "$STUB_LOG")"

# 4. an API error other than NotFound fails the check, not "missing"
STUB_GET_ERROR='error: You must be logged in to the server (Unauthorized)' check production
[ $rc = 2 ] && [[ $out == *"Unauthorized"* && $out != *"missing"* ]] && ok "API error surfaced" || ko "API error: rc=$rc $out"

# 5. bad usage
rc=0; bash "$CHECK" --namespace x </dev/null >/dev/null 2>&1 || rc=$?
[ $rc = 1 ] && ok "missing --environment refused" || ko "usage: rc=$rc"
exit $FAILED
