#!/usr/bin/env bash
# Real nginx (the edge-proxy image) with the realip.inc of every overlay and the
# anonymizing map of default.conf (issue #732):
#   - X-Forwarded-For from a peer inside the overlay's trusted CIDR -> the
#     right-most entry (5.6.7.8), truncated, is logged
#   - the same header from a peer outside it -> ignored, the peer's /24 is logged
# Needs docker. Usage: bash tests/k8s/realip.test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
export MSYS_NO_PATHCONV=1
IMAGE=$(grep -o 'nginx@sha256:[0-9a-f]*' docker-compose.yml | head -1)
P=realip-test-$$
W="$PWD/.realip-test-$$"
mkdir "$W"
cleanup() { docker rm -f "$P-nginx" >/dev/null 2>&1 || true; docker network rm "$P-in" "$P-out" >/dev/null 2>&1 || true; rm -rf "$W"; }
trap cleanup EXIT
# 10.244.7.0/24 is inside every overlay CIDR; 172.30.9.0/24 is outside all of them.
docker network create --subnet 10.244.7.0/24 "$P-in" >/dev/null
docker network create --subnet 172.30.9.0/24 "$P-out" >/dev/null
# map + log_format of default.conf: what the edge-proxy really logs. Stops before
# the rate-limit block, which needs edge-limit-key.inc (not mounted here).
awk '/^map \$remote_addr /{f=1} /^# Rate limit per real/{exit} f' deploy/edge-proxy/default.conf > "$W/maps.conf"
fail=0
check() { # overlay net peer-ip want
  docker rm -f "$P-nginx" >/dev/null 2>&1 || true
  docker run -d --name "$P-nginx" --network "$P-$2" -v "$W/maps.conf:/etc/nginx/conf.d/00-maps.conf:ro" \
    -v "$W/server.conf:/etc/nginx/conf.d/default.conf:ro" -v "$PWD/deploy/k8s/overlays/$1/realip.inc:/etc/nginx/conf.d/realip.inc:ro" "$IMAGE" >/dev/null
  ip=$(docker inspect -f "{{(index .NetworkSettings.Networks \"$P-$2\").IPAddress}}" "$P-nginx")
  sleep 1
  docker run --rm --network "$P-$2" curlimages/curl -s -o /dev/null -H 'X-Forwarded-For: 1.2.3.4, 5.6.7.8' "http://$ip:8080/"
  got=$(docker logs "$P-nginx" 2>&1 | grep -o '"remote_addr":"[^"]*"' | tail -1)
  if [ "$got" = "\"remote_addr\":\"$4\"" ]; then echo "ok   $1 $2 $got"; else echo "FAIL $1 $2: got $got, want $4"; fail=1; fi
}
cat > "$W/server.conf" <<'CONF'
server { listen 8080; include /etc/nginx/conf.d/realip.inc;
  access_log /dev/stdout anonymized; location / { return 200 ok; } }
CONF
for overlay in staging staging-local production; do
  check "$overlay" in x 5.6.7.0
  check "$overlay" out x 172.30.9.0
done
exit $fail
