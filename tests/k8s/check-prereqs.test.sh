#!/usr/bin/env bash
# deploy/k8s/scripts/check-prereqs.sh (issue #419) with a stub kubectl: the
# real staging and production renders against a cluster that has everything,
# then one that has nothing, then one that lacks only the VPA CRD.
#   bash tests/k8s/check-prereqs.test.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
CHECK="$ROOT/deploy/k8s/scripts/check-prereqs.sh"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILED=0
ok() { echo "  ✓ $*"; }
ko() { echo "  ✗ $*"; FAILED=1; }

mkdir -p "$WORK/bin"
cat >"$WORK/bin/kubectl" <<'STUB'
#!/usr/bin/env bash
# $STUB_CRDS: CRDs "group/Kind" served; $STUB_HAVE: "resource/name" objects present.
if [ "$1" = get ] && [ "$2" = crd ]; then printf '%b' "$STUB_CRDS"; exit 0; fi
if [ "$1" = get ]; then case " $STUB_HAVE " in *" $2/$3 "*) exit 0 ;; esac; exit 1; fi
exit 2
STUB
chmod +x "$WORK/bin/kubectl"
export PATH="$WORK/bin:$PATH"

ALL_CRDS='autoscaling.k8s.io/VerticalPodAutoscaler\nbitnami.com/SealedSecret\ncert-manager.io/ClusterIssuer\n'
ALL_HAVE='storageclass/rwx-csi ingressclass/nginx clusterissuer/letsencrypt-prod'
# Minimal render: one object per kind of prerequisite, plus native kinds.
RENDER='apiVersion: v1
kind: ConfigMap
---
apiVersion: autoscaling.k8s.io/v1
kind: VerticalPodAutoscaler
---
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: nginx
---
apiVersion: v1
kind: PersistentVolumeClaim
spec:
  storageClassName: rwx-csi'

run() { STUB_CRDS="$1" STUB_HAVE="$2" bash "$CHECK" <<<"$3" 2>&1 || true; }
fails() { STUB_CRDS="$1" STUB_HAVE="$2" bash "$CHECK" <<<"$3" >/dev/null 2>&1 && return 1 || return 0; }

out=$(run "$ALL_CRDS" "$ALL_HAVE" "$RENDER")
[[ $out == *"present"* ]] && ok "complete cluster passes" || ko "complete cluster: $out"

out=$(run "" "" "$RENDER")
fails "" "" "$RENDER" && ok "bare cluster refused" || ko "bare cluster accepted"
for want in "CRD autoscaling.k8s.io/VerticalPodAutoscaler" "CRD bitnami.com/SealedSecret" "StorageClass rwx-csi" "IngressClass nginx" "ClusterIssuer letsencrypt-prod"; do
	[[ $out == *"$want"* ]] && ok "lists $want" || ko "does not list $want"
done
[[ $out != *"ConfigMap"* && $out != *"CRD networking"* ]] && ok "native kinds ignored" || ko "native kind listed"

out=$(run 'bitnami.com/SealedSecret\ncert-manager.io/ClusterIssuer\n' "$ALL_HAVE" "$RENDER")
[[ $out == *"VerticalPodAutoscaler"* && $out != *"SealedSecret"* ]] && ok "only the VPA CRD missing" || ko "VPA only: $out"

# the real overlays: every prerequisite they name is a known one
for env in staging production; do
	r=$(PATH="${PATH#"$WORK/bin:"}" kubectl kustomize --load-restrictor LoadRestrictionsNone "$ROOT/deploy/k8s/overlays/$env"; PATH="${PATH#"$WORK/bin:"}" kubectl kustomize "$ROOT/deploy/k8s/overlays/$env/node-agents")
	out=$(run "$ALL_CRDS" "$ALL_HAVE" "$r")
	[[ $out == *"present"* ]] && ok "$env overlay passes with the documented prerequisites" || ko "$env overlay: $out"
done
exit $FAILED
