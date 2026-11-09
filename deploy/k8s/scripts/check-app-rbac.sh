#!/usr/bin/env bash
# Live Role deploy-app against deploy/k8s/deploy-identity/app-role.yaml (issue
# #717, ADR-0041). The deploy-app identity cannot give itself rights: a release
# whose overlay needs a new one (3.1.0: leases for the collector Role) is
# Forbidden half way, after the migrations, when an admin has not re-run
# scripts/deploy-identity.sh app. Runs with the app kubeconfig (current kubectl
# context), read-only, before any apply; same normalization as
# check-cluster-rbac.sh (rules only, metadata ignored). Exits 1 when different.
#   bash deploy/k8s/scripts/check-app-rbac.sh --namespace NS --environment OVERLAY
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

ROLE_FILE="$(cd "$(dirname "$0")/../deploy-identity" && pwd)/app-role.yaml"
NORM='{rules: (.rules // [])}'
desired=$(kubectl create --dry-run=client -o json -f "$ROLE_FILE" | jq -cS "$NORM")

err=$(mktemp)
trap 'rm -f "$err"' EXIT
if live=$(kubectl get role deploy-app -n "$NAMESPACE" -o json 2>"$err"); then
	[ "$(jq -cS "$NORM" <<<"$live")" != "$desired" ] || { echo "Role deploy-app is up to date"; exit 0; }
	problem="differs from deploy/k8s/deploy-identity/app-role.yaml"
else
	# Any other error (API unreachable, Forbidden) fails the script, not "missing".
	grep -q NotFound "$err" || { cat "$err" >&2; exit 2; }
	problem="is missing"
fi

if [ "$ENVIRONMENT" = staging-local ]; then
	cmd="bash deploy/staging-local/bootstrap.sh identities"
else
	cmd="bash scripts/deploy-identity.sh app --namespace $NAMESPACE | base64 -w0 | gh secret set KUBECONFIG_${ENVIRONMENT^^}_APP --env $ENVIRONMENT"
fi
echo "::error::The live Role deploy-app in $NAMESPACE $problem: the deploy-app identity cannot grant itself rights, so the apply would be Forbidden after the migrations. An admin must run \`$cmd\` (with the new release checked out) before this deploy (ADR-0041)"
exit 1
