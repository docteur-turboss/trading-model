#!/usr/bin/env bash
# Grafana upgrade on an existing database (issue #2414): a base provisioned
# without uid for Loki (as before #1487) must start on the datasources.yml that
# carries them. Control: without deleteDatasources Grafana must crash.
set -euo pipefail
cd "$(dirname "$0")/../.."
SRC=deploy/k8s/infra/config/datasources.yml
IMAGE=$(grep -oE 'grafana/grafana:[^ ]+' deploy/k8s/infra/grafana.yaml | head -1)
T=$(mktemp -d); N=gf-upgrade-$$
trap 'docker rm -f $N >/dev/null 2>&1 || true; docker volume rm -f $N >/dev/null 2>&1 || true; rm -rf "$T"' EXIT
sed '/^deleteDatasources:/,/^datasources:/{/^datasources:/!d}' "$SRC" > "$T/nodelete.yml"
sed '/uid: loki/d' "$T/nodelete.yml" > "$T/old.yml"
cp "$SRC" "$T/new.yml"
docker volume create "$N" >/dev/null

# run <file>: start Grafana on the shared volume. 0 once provisioning listed Loki
# (/api/health answers earlier), 1 if the container exits first.
run() {
  docker rm -f $N >/dev/null 2>&1 || true
  docker run -d --name $N -p 127.0.0.1::3000 -v "$N:/var/lib/grafana" \
    -v "$(cygpath -m "$T" 2>/dev/null || echo "$T")/$1:/etc/grafana/provisioning/datasources/ds.yml:ro" "$IMAGE" >/dev/null
  PORT=$(docker port $N 3000/tcp | head -1 | sed 's/.*://')
  for _ in $(seq 300); do
    [[ "$(curl -s -u admin:admin "http://127.0.0.1:$PORT/api/datasources")" == *'"name":"Loki"'* ]] && return 0
    [ "$(docker inspect -f '{{.State.Running}}' $N)" = true ] || return 1
    sleep 2
  done
  return 1
}

run old.yml || { docker logs $N 2>&1 | tail -5; echo "FAIL: old provisioning does not start"; exit 1; }
docker stop $N >/dev/null

if run nodelete.yml; then echo "FAIL: control without deleteDatasources started: cause not reproduced"; exit 1; fi
docker logs $N 2>&1 | grep -q "data source not found" || { docker logs $N 2>&1 | tail -5; echo "FAIL: control failed for another reason"; exit 1; }
echo "ok: without deleteDatasources Grafana fails with 'data source not found'"

run new.yml || { docker logs $N 2>&1 | tail -5; echo "FAIL: new datasources.yml does not start on the existing volume"; exit 1; }
for uid in loki jaeger; do
  curl -fs -u admin:admin "http://127.0.0.1:$PORT/api/datasources/uid/$uid" >/dev/null || { echo "FAIL: uid $uid missing"; exit 1; }
done
echo "ok: Grafana starts on the existing volume, uid loki and jaeger present"
