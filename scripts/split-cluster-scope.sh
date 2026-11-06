#!/usr/bin/env bash
# Keep, from a rendered kustomization on stdin, the documents of one scope
# (ADR-0041): `cluster` = objects no namespace owns, applied with the
# cluster-scope identity; `app` = everything else, applied with the
# application identity. A new cluster-scope kind goes in the awk BEGIN list here
# and in deploy/k8s/deploy-identity/cluster-role.yaml.
#   kubectl kustomize ... | bash scripts/split-cluster-scope.sh app|cluster
set -euo pipefail

SCOPE="${1:-}"
case "$SCOPE" in app | cluster) ;; *) echo "Usage: $0 app|cluster" >&2; exit 1 ;; esac

awk -v scope="$SCOPE" '
BEGIN { split("Namespace ClusterRole ClusterRoleBinding CSIDriver CustomResourceDefinition StorageClass PriorityClass ValidatingWebhookConfiguration MutatingWebhookConfiguration", k, " "); for (i in k) cluster[k[i]] = 1 }
function flush() {
	if (doc == "") return
	if ((kind in cluster) == (scope == "cluster")) { printf "%s%s", sep, doc; sep = "---\n" }
	doc = ""; kind = ""
}
/^---[ \t]*$/ { flush(); next }
/^kind:[ \t]/ && kind == "" { kind = $2 }
{ doc = doc $0 "\n" }
END { flush() }
'
