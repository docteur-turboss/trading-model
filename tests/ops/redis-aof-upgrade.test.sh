#!/usr/bin/env bash
# Upgrade of a Redis AOF from 3.0.x (redis 7.4.11) to the current image (issue #2407):
# scripts/redis-aof-rewrite.sh rewrites it under 7.4, then the image of
# deploy/k8s/infra/redis.yaml loads every key; once that image has rewritten the
# AOF, 7.4 cannot load it (no rollback of the data). Needs Docker; not in pre-push.
# Run: bash tests/ops/redis-aof-upgrade.test.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
OLD=redis@sha256:ff02b58f971e7d7d156a1267e283fcbbeee91773b6aa36c49dac28ecfe28eadf # 7.4.11, v3.0.0
NEW=$(sed -n 's/^ *image: \(redis:[^ ]*\)$/\1/p' deploy/k8s/infra/redis.yaml | head -1)
VOL=redis-aof-upgrade-test-$$
trap 'docker volume rm -f "$VOL" >/dev/null' EXIT
docker volume create "$VOL" >/dev/null
# A Docker volume, not a bind mount: on a Windows bind mount BGREWRITEAOF fails (rename).
run() { docker run --rm -i -u 999 -v "$VOL:/data" "$@"; }
wait_up='i=0; until [ "$(redis-cli ping 2>/dev/null)" = PONG ]; do i=$((i+1)); [ $i -lt 120 ] || { cat /tmp/l; exit 1; }; sleep 0.5; done'

# 3.0.x data: base written by a rewrite, then an increment with the journal commands of the bus.
run "$OLD" sh -c "redis-server --appendonly yes --dir /data --daemonize yes --logfile /tmp/l; $wait_up
for i in \$(seq 1 200); do echo \"XADD journal \$((1000+i))-0 message m\$i\"; done | redis-cli >/dev/null
redis-cli XGROUP CREATE journal g 0 >/dev/null; redis-cli HSET h a 1 >/dev/null; redis-cli BGREWRITEAOF >/dev/null; sleep 2
for i in \$(seq 201 400); do echo \"XADD journal MINID = \$((800+i))-0 \$((1000+i))-0 message m\$i\"; done | redis-cli >/dev/null
redis-cli SADD s x >/dev/null; redis-cli SHUTDOWN"

out=$(run "$OLD" sh -s <scripts/redis-aof-rewrite.sh)
echo "$out" | grep -q '^keys: 3$' || { echo "FAIL: rewrite under 7.4: $out"; exit 1; }
echo "$out" | grep -qE ' 0 .*\.incr\.aof$' || { echo "FAIL: increment not empty after the rewrite: $out"; exit 1; }

got=$(run "$NEW" sh -c "redis-server --appendonly yes --dir /data --daemonize yes --logfile /tmp/l; $wait_up
echo \$(redis-cli DBSIZE) \$(redis-cli XLEN journal); redis-cli BGREWRITEAOF >/dev/null; sleep 2; redis-cli SHUTDOWN")
[ "$got" = "3 201" ] || { echo "FAIL: $NEW after the rewrite: '$got', expected '3 201'"; exit 1; }

back=$(run "$OLD" sh -c "redis-server --appendonly yes --dir /data --daemonize yes --logfile /tmp/l; sleep 3; cat /tmp/l")
echo "$back" | grep -q "Can't handle RDB format version" ||
	{ echo "FAIL: 7.4 loaded an AOF rewritten by $NEW: update the rollback note of DEPLOY.md"; exit 1; }
echo "PASS: 7.4 rewrite then $NEW loads 3 keys / 201 entries; 7.4 refuses the AOF rewritten by $NEW"
