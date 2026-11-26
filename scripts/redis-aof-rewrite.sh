#!/bin/sh
# Rewrites the AOF of a stopped Redis node offline, run by `sh -s` inside a
# throwaway redis:7.4.11 container that mounts the node's data at /data
# (docs/deployment/DEPLOY.md, "Upgrading from 3.0.x"; issue #2407). Redis 8.10.3
# stops on an assertion while it replays an AOF increment written by 7.4.11;
# after this rewrite the increment is empty and 8.10.3 loads the base.
# Prints the key count before the rewrite; exits non-zero if the rewrite fails.
set -eu
c="redis-cli -s /tmp/redis.sock"
redis-server --appendonly yes --dir /data --port 0 --unixsocket /tmp/redis.sock \
	--daemonize yes --logfile /tmp/redis.log
i=0
until [ "$($c ping 2>/dev/null)" = PONG ]; do
	i=$((i + 1))
	[ "$i" -lt 600 ] || { cat /tmp/redis.log; exit 1; }
	sleep 1
done
echo "keys: $($c dbsize)"
$c bgrewriteaof >/dev/null
sleep 1
until $c info persistence | grep -q '^aof_rewrite_in_progress:0'; do sleep 1; done
$c info persistence | grep -q '^aof_last_bgrewrite_status:ok' || { cat /tmp/redis.log; exit 1; }
$c shutdown
wait
ls -l /data/appendonlydir
