#!/usr/bin/env bash
# ClusterRoles and ClusterRoleBindings of rendered manifests (issue #701,
# ADR-0041). The deploy-cluster identity may only get/list them: an admin
# applies them with scripts/deploy-identity.sh cluster. Reads the rendered YAML
# on stdin and checks, against the current kubectl context, that each of them
# exists with the same rules (ClusterRole) or roleRef and subjects
# (ClusterRoleBinding). Lists every missing or different object with the admin
# command and exits 1, so deploy.yml stops before any apply (the apply would be
# Forbidden otherwise). Read-only: `kubectl diff` would need patch.
#   kubectl kustomize ... | bash deploy/k8s/scripts/check-cluster-rbac.sh --namespace NS --environment OVERLAY
set -euo pipefail

NAMESPACE="" ENVIRONMENT=""
while [ $# -gt 0 ]; do
	case "$1" in
	--namespace) NAMESPACE="${2:-}"; shift 2 ;;
	--environment) ENVIRONMENT="${2:-}"; shift 2 ;;
	*) echo "Unknown argument: $1" >&2; exit 1 ;;
	esac
done
[ -n "$NAMESPACE" ] && [ -n "$ENVIRONMENT" ] || { echo "Usage: $0 --namespace NS --environment OVERLAY" >&2; exit 1; }

# Only the RBAC documents: the other cluster-scope kinds are applied by the identity itself.
rbac=$(awk '
function flush() { if (kind == "ClusterRole" || kind == "ClusterRoleBinding") { printf "%s%s", sep, doc; sep = "---\n" } doc = ""; kind = "" }
/^---[ \t]*$/ { flush(); next }
/^kind:[ \t]/ && kind == "" { kind = $2 }
{ doc = doc $0 "\n" }
END { flush() }
')
[ -n "$rbac" ] || { echo "No ClusterRole or ClusterRoleBinding in the render"; exit 0; }

# What `kubectl apply` would change: subjects lose apiGroup, which the API server defaults.
NORM='def norm: if .kind == "ClusterRole" then (if .aggregationRule then {aggregationRule} else {rules: (.rules // [])} end)
  else {roleRef, subjects: ((.subjects // []) | map(del(.apiGroup)))} end;'
desired=$(kubectl create --dry-run=client -o json -f - <<<"$rbac" | jq -c "$NORM"' if .kind == "List" then .items[] else . end | {kind, name: .metadata.name, spec: norm}')

problems=()
err=$(mktemp)
trap 'rm -f "$err"' EXIT
while IFS= read -r obj; do
	kind=$(jq -r .kind <<<"$obj")
	name=$(jq -r .name <<<"$obj")
	if ! live=$(kubectl get "$kind" "$name" -o json 2>"$err"); then
		# Any other error (API unreachable, Forbidden) fails the script, not "missing".
		grep -q NotFound "$err" || { cat "$err" >&2; exit 2; }
		problems+=("$kind $name (missing)")
		continue
	fi
	[ "$(jq -cS "$NORM norm" <<<"$live")" = "$(jq -cS .spec <<<"$obj")" ] || problems+=("$kind $name (differs)")
done <<<"$desired"

if [ ${#problems[@]} -gt 0 ]; then
	if [ "$ENVIRONMENT" = staging-local ]; then
		cmd="bash deploy/staging-local/bootstrap.sh identities"
	else
		cmd="bash scripts/deploy-identity.sh cluster --namespace $NAMESPACE --environment $ENVIRONMENT"
	fi
	printf -v list '%s, ' "${problems[@]}"
	echo "::error::The deploy-cluster identity cannot create or change ${list%, }: an admin must run \`$cmd\` (with the new release checked out) before this deploy (ADR-0041)"
	exit 1
fi
echo "ClusterRoles and ClusterRoleBindings of the render are present and up to date"
