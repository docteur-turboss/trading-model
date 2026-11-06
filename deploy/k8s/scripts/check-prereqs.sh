#!/usr/bin/env bash
# Cluster prerequisites of rendered manifests (issue #419). Reads the rendered
# YAML on stdin and checks, against the current kubectl context, what the
# manifests need and a bare cluster lacks: the CRD of every non-native kind,
# every StorageClass, IngressClass and cert-manager ClusterIssuer they name.
# Lists everything missing and exits 1, so deploy.yml stops before any apply
# (a missing CRD otherwise fails "no matches for kind" half way through).
#   kubectl kustomize deploy/k8s/overlays/staging | bash deploy/k8s/scripts/check-prereqs.sh
set -euo pipefail

rendered=$(cat)
missing=()

native() { # group served by the API server itself; anything else is a CRD
	case "$1" in
	'' | apps | batch | autoscaling | policy | networking.k8s.io | rbac.authorization.k8s.io | storage.k8s.io | apiextensions.k8s.io | admissionregistration.k8s.io | scheduling.k8s.io | coordination.k8s.io | discovery.k8s.io | node.k8s.io | certificates.k8s.io | events.k8s.io | flowcontrol.apiserver.k8s.io | apiregistration.k8s.io) return 0 ;;
	*) return 1 ;;
	esac
}

# Fails the script (not "missing") when the API cannot be queried at all.
crds=$(kubectl get crd -o jsonpath='{range .items[*]}{.spec.group}/{.spec.names.kind}{"\n"}{end}')

# top-level apiVersion + kind of every document -> "group/Kind"
while IFS= read -r gk; do
	group=${gk%%/*}
	native "$group" && continue
	grep -qxF "$gk" <<<"$crds" || missing+=("CRD $gk")
done < <(awk '
	/^---/ { av = ""; next }
	/^apiVersion:/ { av = $2; sub(/\/.*/, "", av); if ($2 !~ /\//) av = "" }
	/^kind:/ && !done[av "/" $2]++ { print av "/" $2 }
' <<<"$rendered" | sort -u)

check() { # <kubectl resource> <name> <label>
	kubectl get "$1" "$2" >/dev/null 2>&1 || missing+=("$3 $2")
}
while IFS= read -r n; do [ -z "$n" ] || check storageclass "$n" StorageClass; done < \
	<(sed -nE 's/^[[:space:]]*storageClassName:[[:space:]]*"?([^"[:space:]]+)"?.*/\1/p' <<<"$rendered" | sort -u)
while IFS= read -r n; do [ -z "$n" ] || check ingressclass "$n" IngressClass; done < \
	<(sed -nE 's/^[[:space:]]*ingressClassName:[[:space:]]*"?([^"[:space:]]+)"?.*/\1/p' <<<"$rendered" | sort -u)
while IFS= read -r n; do [ -z "$n" ] || check clusterissuer "$n" ClusterIssuer; done < \
	<(sed -nE 's#^[[:space:]]*cert-manager\.io/cluster-issuer:[[:space:]]*"?([^"[:space:]]+)"?.*#\1#p' <<<"$rendered" | sort -u)

if [ ${#missing[@]} -gt 0 ]; then
	echo "::error::The cluster lacks prerequisites of the manifests (docs/deployment/KUBERNETES.md, Prerequisites):"
	printf '  - %s\n' "${missing[@]}"
	exit 1
fi
echo "Cluster prerequisites present"
