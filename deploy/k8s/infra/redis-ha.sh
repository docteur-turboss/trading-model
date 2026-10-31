#!/bin/sh
# Starts one member of the Redis HA group (Sentinel-managed master/replicas).
#
#   redis-ha.sh server [redis-server args...]
#       Joins the current master as a replica. With no master anywhere, the
#       ordinal-0 pod bootstraps the group as master.
#   redis-ha.sh sentinel
#       Writes a fresh sentinel.conf (Sentinel rewrites its config, so it can't
#       be a read-only ConfigMap) and monitors the current master.
#
# Nodes are addressed by IP: with `resolve-hostnames`, a dead master's name
# stops resolving and Sentinel stalls in TILT mode instead of failing over.
#
# Environment: REDIS_HOSTS and SENTINEL_HOSTS (space-separated DNS names of
# every member), POD_IP, plus the optional tunables below.
set -eu

MASTER_NAME="${MASTER_NAME:-mymaster}"
REDIS_PORT="${REDIS_PORT:-6379}"
SENTINEL_PORT="${SENTINEL_PORT:-26379}"
SENTINEL_QUORUM="${SENTINEL_QUORUM:-2}"
DOWN_AFTER_MS="${DOWN_AFTER_MS:-5000}"
FAILOVER_TIMEOUT_MS="${FAILOVER_TIMEOUT_MS:-30000}"
MASTER_WAIT_SECONDS="${MASTER_WAIT_SECONDS:-120}"
SENTINEL_CONF="${SENTINEL_CONF:-/data/sentinel.conf}"
SELF_IP="${POD_IP:-$(hostname -i | awk '{print $1}')}"
SELF_NAME="$(hostname)"

log() {
	echo "[redis-ha] $*" >&2
}

is_ip() {
	case "$1" in
	"" | *[!0-9a-fA-F.:]*) return 1 ;;
	*) return 0 ;;
	esac
}

resolve() {
	ip=$(getent hosts "$1" | awk 'NR == 1 { print $1 }')
	[ -n "$ip" ] && echo "$ip"
}

answers() {
	[ "$(redis-cli -h "$1" -p "$REDIS_PORT" PING 2>/dev/null)" = "PONG" ]
}

# The master a reachable sentinel currently designates.
master_from_sentinels() {
	for host in $SENTINEL_HOSTS; do
		addr=$(redis-cli -h "$host" -p "$SENTINEL_PORT" --raw \
			SENTINEL get-master-addr-by-name "$MASTER_NAME" 2>/dev/null | head -n 1)
		if is_ip "$addr"; then
			echo "$addr"
			return 0
		fi
	done
	return 1
}

# Another Redis node that reports itself master, when no sentinel answers.
master_from_nodes() {
	for host in $REDIS_HOSTS; do
		ip=$(resolve "$host") || continue
		[ "$ip" = "$SELF_IP" ] && continue
		role=$(redis-cli -h "$ip" -p "$REDIS_PORT" --raw ROLE 2>/dev/null | head -n 1)
		if [ "$role" = "master" ]; then
			echo "$ip"
			return 0
		fi
	done
	return 1
}

give_up_after_wait() {
	waited=$((waited + 1))
	if [ "$waited" -ge "$MASTER_WAIT_SECONDS" ]; then
		log "no reachable master after ${MASTER_WAIT_SECONDS}s"
		exit 1
	fi
	sleep 1
}

start_server() {
	waited=0
	while :; do
		if master=$(master_from_sentinels); then
			if [ "$master" = "$SELF_IP" ]; then
				log "sentinels still name this pod master"
				exec redis-server "$@"
			fi
			# Right after the master's pod dies, sentinels name it until they fail over.
			if answers "$master"; then
				log "replica of $master (from sentinels)"
				exec redis-server "$@" --replicaof "$master" "$REDIS_PORT"
			fi
			log "sentinels name $master, which does not answer yet"
		elif master=$(master_from_nodes); then
			log "replica of $master (no sentinel answered)"
			exec redis-server "$@" --replicaof "$master" "$REDIS_PORT"
		elif [ "${SELF_NAME##*-}" = "0" ]; then
			log "no master anywhere: bootstrapping the group as master"
			exec redis-server "$@"
		fi
		give_up_after_wait
	done
}

start_sentinel() {
	waited=0
	until master=$(master_from_sentinels) || master=$(master_from_nodes); do
		give_up_after_wait
	done
	# A stable id per pod: when a restarted sentinel comes back with a new IP,
	# its peers replace the old address instead of keeping a ghost sentinel.
	# Ghosts pile up with every rollout and count as voters: once they make
	# the live sentinels a minority, no failover can be authorized.
	myid=$(printf '%s' "$SELF_NAME" | sha1sum | cut -c1-40)
	cat >"$SENTINEL_CONF" <<EOF
port $SENTINEL_PORT
sentinel myid $myid
sentinel monitor $MASTER_NAME $master $REDIS_PORT $SENTINEL_QUORUM
sentinel down-after-milliseconds $MASTER_NAME $DOWN_AFTER_MS
sentinel failover-timeout $MASTER_NAME $FAILOVER_TIMEOUT_MS
sentinel parallel-syncs $MASTER_NAME 1
EOF
	log "monitoring $master"
	exec redis-server "$SENTINEL_CONF" --sentinel
}

role="${1:-}"
[ $# -gt 0 ] && shift
case "$role" in
server) start_server "$@" ;;
sentinel) start_sentinel ;;
*)
	log "usage: redis-ha.sh server [redis-server args...] | sentinel"
	exit 64
	;;
esac
