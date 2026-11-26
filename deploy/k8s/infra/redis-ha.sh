#!/bin/sh
# Starts one member of the Redis HA group (Sentinel-managed master/replicas).
#
#   redis-ha.sh server [redis-server args...]
#       Joins the current master as a replica. With no master anywhere, the
#       node that was master last bootstraps the group, else ordinal 0.
#   redis-ha.sh sentinel
#       Writes a fresh sentinel.conf (Sentinel rewrites its config, so it can't
#       be a read-only ConfigMap) and monitors the current master.
#   redis-ha.sh probe server|sentinel
#       Exit 0 when the local node answers PING (probes authenticate with the
#       internal user).
#
# Nodes are addressed by IP: with `resolve-hostnames`, a dead master's name
# stops resolving and Sentinel stalls in TILT mode instead of failing over.
#
# Environment: REDIS_HOSTS and SENTINEL_HOSTS (space-separated DNS names of
# every member), POD_IP, plus the optional tunables below.
#
# Access control (issue #506): with REDIS_INTERNAL_PASSWORD set, the default
# user is switched off and the nodes get one ACL user per service, limited to
# its key prefix and to the commands it uses (docs/architecture/databases.md),
# plus the `ha` user (replication, Sentinel, probes) that reaches no key.
# Sentinels require the same password. Each service password is optional: a
# service without one gets no user. Without REDIS_INTERNAL_PASSWORD nothing is
# protected (dev, tests). With REDIS_EXPORTER_PASSWORD, data nodes and
# sentinels also get the read-only `exporter` user of the metrics sidecars
# (ADR-0056).
#
# TLS (issue #930, ADR-0047), REDIS_TLS_MODE with the Secret redis-tls mounted
# at REDIS_TLS_DIR (tls.crt, tls.key, ca.crt; cert-manager):
#   off       (default) no TLS.
#   optional  release N: the nodes and sentinels also listen in TLS (6380 /
#             26380), no client certificate asked. Replication and Sentinel stay
#             in clear text on 6379 / 26379, the ports Sentinel announces, so
#             the clients of release N-1 keep following it.
#   required  release N+1: clear port closed (`port 0`), `tls-replication yes`,
#             Sentinel monitors the TLS port. Every client must use TLS.
set -eu

MASTER_NAME="${MASTER_NAME:-mymaster}"
REDIS_PORT="${REDIS_PORT:-6379}"
SENTINEL_PORT="${SENTINEL_PORT:-26379}"
SENTINEL_QUORUM="${SENTINEL_QUORUM:-2}"
DOWN_AFTER_MS="${DOWN_AFTER_MS:-5000}"
FAILOVER_TIMEOUT_MS="${FAILOVER_TIMEOUT_MS:-30000}"
MASTER_WAIT_SECONDS="${MASTER_WAIT_SECONDS:-120}"
SENTINEL_CONF="${SENTINEL_CONF:-/data/sentinel.conf}"
DATA_DIR="${DATA_DIR:-/data}"
MASTER_MARKER="${MASTER_MARKER:-$DATA_DIR/was-master}"
COLD_START_GRACE_SECONDS="${COLD_START_GRACE_SECONDS:-30}"
REDIS_TLS_MODE="${REDIS_TLS_MODE:-off}"
REDIS_TLS_DIR="${REDIS_TLS_DIR:-/etc/redis-tls}"
REDIS_TLS_PORT="${REDIS_TLS_PORT:-6380}"
SENTINEL_TLS_PORT="${SENTINEL_TLS_PORT:-26380}"
case "$REDIS_TLS_MODE" in
off | optional) ;;
required)
	# The scripts below only talk to the TLS ports.
	REDIS_PORT="$REDIS_TLS_PORT"
	SENTINEL_PORT="$SENTINEL_TLS_PORT"
	;;
*)
	echo "[redis-ha] REDIS_TLS_MODE must be off, optional or required, got $REDIS_TLS_MODE" >&2
	exit 64
	;;
esac
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

# redis-cli flags: the certificate carries `redis`, not the IP the scripts use.
tls_cli_args() {
	[ "$REDIS_TLS_MODE" = required ] && printf '%s
' --tls --cacert "$REDIS_TLS_DIR/ca.crt" --sni redis
	return 0
}

# redis-cli against a data node / a sentinel, authenticated when ACLs are on.
node_cli() {
	if [ -n "${REDIS_INTERNAL_PASSWORD:-}" ]; then
		# shellcheck disable=SC2046 # tls_cli_args prints several flags, the split is intended
		REDISCLI_AUTH="$REDIS_INTERNAL_PASSWORD" redis-cli $(tls_cli_args) --user ha "$@"
	else
		# shellcheck disable=SC2046 # tls_cli_args prints several flags, the split is intended
		redis-cli $(tls_cli_args) "$@"
	fi
}

sentinel_cli() {
	if [ -n "${REDIS_INTERNAL_PASSWORD:-}" ]; then
		# shellcheck disable=SC2046 # tls_cli_args prints several flags, the split is intended
		REDISCLI_AUTH="$REDIS_INTERNAL_PASSWORD" redis-cli $(tls_cli_args) "$@"
	else
		# shellcheck disable=SC2046 # tls_cli_args prints several flags, the split is intended
		redis-cli $(tls_cli_args) "$@"
	fi
}

answers() {
	[ "$(node_cli -h "$1" -p "$REDIS_PORT" PING 2>/dev/null)" = "PONG" ]
}

# The master a reachable sentinel currently designates.
master_from_sentinels() {
	for host in $SENTINEL_HOSTS; do
		addr=$(sentinel_cli -h "$host" -p "$SENTINEL_PORT" --raw \
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
		role=$(node_cli -h "$ip" -p "$REDIS_PORT" --raw ROLE 2>/dev/null | head -n 1)
		if [ "$role" = "master" ]; then
			echo "$ip"
			return 0
		fi
	done
	return 1
}

# No grace to wait out when no peer exists (single node) or one already runs as replica
# (rolling update of redis-0): the group is not cold, the master role is only being replaced.
no_cold_start() {
	found=0
	for host in $REDIS_HOSTS; do
		ip=$(resolve "$host") || continue
		[ "$ip" = "$SELF_IP" ] && continue
		found=1
		[ "$(node_cli -h "$ip" -p "$REDIS_PORT" --raw ROLE 2>/dev/null | head -n 1)" = "slave" ] && return 0
	done
	[ "$found" = 0 ]
}

give_up_after_wait() {
	waited=$((waited + 1))
	if [ "$waited" -ge "$MASTER_WAIT_SECONDS" ]; then
		log "no reachable master after ${MASTER_WAIT_SECONDS}s"
		exit 1
	fi
	sleep 1
}

# Prints, one per line, the redis-server arguments that create the users.
acl_args() {
	[ -n "${REDIS_INTERNAL_PASSWORD:-}" ] || return 0
	print_args --user default off
	print_args --masteruser ha --masterauth "$REDIS_INTERNAL_PASSWORD"
	print_args --user ha on ">$REDIS_INTERNAL_PASSWORD" allchannels -@all +psync +replconf +ping
	print_args +role +info +multi +exec +slaveof +replicaof +subscribe +publish
	# client|pause: writes held on the old master of a planned failover (deploy-release.sh, ADR-0090).
	print_args "+config|rewrite" "+client|setname" "+client|kill" "+script|kill" "+client|pause" "+client|unpause"
	service_user discovery "${REDIS_DISCOVERY_PASSWORD:-}" "trading-model:discovery:*" +get +set +del +mget +sadd +srem +smembers +sismember +scard +eval +evalsha "+script|load"
	# Kept one release (expand/contract, ADR-0040): N-1 pods still publish through message-manager during the rollout; removed in N+1.
	service_user message-manager "${REDIS_MESSAGE_MANAGER_PASSWORD:-}" "trading-model:message-manager:*" +hset +hgetall +hdel +pexpire +sadd +srem +smembers +exists +xadd +xdel +xlen +xreadgroup +xpending +xclaim +xack +xgroup +xinfo +xrange +wait
	service_user dlq-service "${REDIS_DLQ_PASSWORD:-}" "dlq:queue" +llen +lpush +lrange +ltrim +eval +evalsha "+script|load"
	# Bus users (ADR-0073, #1620): write only the journal of the topics published, consume only the topics subscribed.
	# Topic lists = EVENT_PUBLISHERS / EVENT_SUBSCRIBERS of @trading-model/contracts/event-routes (checked by bus-acl.spec.ts).
	bus_user audit-logger "${REDIS_AUDIT_LOGGER_PASSWORD:-}" "audit.heartbeat audit.gap.detected dlq.entry.added dlq.replay.completed dlq.entries.deleted" "audit.heartbeat audit.gap.detected training.model.published dlq.entry.added dlq.replay.completed dlq.entries.deleted risk.order.transitioned risk.kill-switch.engaged risk.kill-switch.rearmed risk.promotion.loaded"
	bus_user trader-trainer "${REDIS_TRADER_TRAINER_PASSWORD:-}" "training.model.published" ""
	bus_user risk-execution "${REDIS_RISK_EXECUTION_PASSWORD:-}" "risk.order.transitioned risk.kill-switch.engaged risk.kill-switch.rearmed" ""
	bus_user decision-consumer "${REDIS_DECISION_CONSUMER_PASSWORD:-}" "risk.promotion.loaded" ""
	bus_user model-evaluator "${REDIS_MODEL_EVALUATOR_PASSWORD:-}" "dlq.entry.added" "training.model.published"
	exporter_user
}

# The redis_exporter sidecar (issue #601): INFO, latency and slowlog, no key,
# no CONFIG GET (it would hand out masterauth). Optional, like the services.
exporter_user() {
	[ -n "${REDIS_EXPORTER_PASSWORD:-}" ] || return 0
	print_args --user exporter on ">$REDIS_EXPORTER_PASSWORD" -@all +ping +info "+client|setname" "+slowlog|get" "+slowlog|len" "+latency|latest" "+latency|histogram"
}

# redis-server arguments of the TLS listener (see REDIS_TLS_MODE above).
tls_args() {
	[ "$REDIS_TLS_MODE" != off ] || return 0
	print_args --tls-port "$REDIS_TLS_PORT" --tls-cert-file "$REDIS_TLS_DIR/tls.crt" --tls-key-file "$REDIS_TLS_DIR/tls.key" --tls-ca-cert-file "$REDIS_TLS_DIR/ca.crt" --tls-auth-clients no
	[ "$REDIS_TLS_MODE" = required ] && print_args --port 0 --tls-replication yes
	return 0
}

print_args() {
	printf "%s\n" "$@"
}

# $1 user, $2 password, $3 key pattern, $4... commands. Every service also gets
# what ioredis sends on connect (INFO, ROLE, CLIENT SETNAME/SETINFO) and PING.
service_user() {
	[ -n "$2" ] || return 0
	user="$1"
	password="$2"
	keys="$3"
	shift 3
	print_args --user "$user" on ">$password" -@all "~$keys" +ping +info +role "+client|setname" "+client|setinfo" +multi +exec "$@"
}

# $1 user, $2 password, $3 topics published, $4 topics subscribed. A selector per
# stream (Redis 7): the journal of a published topic is written, that of a
# subscribed topic is read and acknowledged, its dead stream is written.
bus_user() {
	[ -n "$2" ] || return 0
	prefix="trading-model:message-manager"
	print_args --user "$1" on ">$2" -@all "~$prefix:journal-groups" +ping +info +role "+client|setname" "+client|setinfo" +multi +exec +wait +sadd +smembers
	for topic in $3; do
		print_args "(%RW~$prefix:journal:$topic +xadd +xdel +xgroup|create +xinfo)"
	done
	for topic in $4; do
		print_args "(%RW~$prefix:journal:$topic +xreadgroup +xpending +xclaim +xack +xgroup|create +xgroup|delconsumer +xinfo +xrange +xlen)"
		print_args "(%RW~$prefix:dead:$topic +xadd +xdel +xinfo +xrange +xlen)"
	done
}

# Keeps a marker on the PVC while this node is master, removes it once it is a replica.
track_master_role() {
	while :; do
		state=$(node_cli -p "$REDIS_PORT" --raw ROLE 2>/dev/null | head -n 1) || true
		case "$state" in
		master) : >"$MASTER_MARKER" ;;
		slave) rm -f "$MASTER_MARKER" ;;
		esac
		sleep 2
	done
}

start_server() {
	track_master_role &
	# Arguments are read line by line: no password may contain a newline.
	while IFS= read -r line; do
		[ -n "$line" ] && set -- "$@" "$line"
	done <<ACL
$(acl_args; tls_args)
ACL
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
		# Cold start (every pod down together). Rule: the node that held the master
		# role when the group went down (marker on its PVC, see track_master_role)
		# bootstraps; redis-0 only does so if no marked peer showed up within
		# COLD_START_GRACE_SECONDS (or when its volume holds no data yet), so a promoted
		# replica's writes are never overwritten. A pod without marker (release N-1,
		# lost volume) falls back to redis-0. The StatefulSet is Parallel so every peer
		# is up during the grace (OrderedReady would start redis-0 alone). Known limit:
		# two nodes marked together (old master back in the same outage as the promoted
		# one, or the 2 s before the marker follows a promotion) both bootstrap and
		# Sentinel picks one; nodes that are not running yet share no channel to break
		# the tie, and it takes a double fault. No peer, or a peer already running as replica, means
		# no cold start (single node, rolling update of redis-0): no grace, as before.
		elif [ -e "$MASTER_MARKER" ] || { [ "${SELF_NAME##*-}" = "0" ] &&
			{ { [ ! -d "$DATA_DIR/appendonlydir" ] && [ ! -e "$DATA_DIR/dump.rdb" ]; } || [ "$waited" -ge "$COLD_START_GRACE_SECONDS" ] || no_cold_start; }; }; then
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
	# Plain port stays open until the required step; `port 0` closes it.
	if [ "$REDIS_TLS_MODE" = required ]; then
		plain_port=0
	else
		plain_port="$SENTINEL_PORT"
	fi
	cat >"$SENTINEL_CONF" <<EOF
port $plain_port
sentinel myid $myid
sentinel monitor $MASTER_NAME $master $REDIS_PORT $SENTINEL_QUORUM
sentinel down-after-milliseconds $MASTER_NAME $DOWN_AFTER_MS
sentinel failover-timeout $MASTER_NAME $FAILOVER_TIMEOUT_MS
sentinel parallel-syncs $MASTER_NAME 1
EOF
	if [ -n "${REDIS_INTERNAL_PASSWORD:-}" ]; then
		cat >>"$SENTINEL_CONF" <<EOF
requirepass $REDIS_INTERNAL_PASSWORD
sentinel sentinel-pass $REDIS_INTERNAL_PASSWORD
EOF
	fi
	if [ -n "${REDIS_INTERNAL_PASSWORD:-}" ]; then
		cat >>"$SENTINEL_CONF" <<EOF
sentinel auth-user $MASTER_NAME ha
sentinel auth-pass $MASTER_NAME $REDIS_INTERNAL_PASSWORD
EOF
	fi
	# The exporter reads the master, replica and sentinel lists, changes nothing.
	if [ -n "${REDIS_EXPORTER_PASSWORD:-}" ]; then
		cat >>"$SENTINEL_CONF" <<EOF
user exporter on >$REDIS_EXPORTER_PASSWORD -@all +ping +info +client|setname +sentinel|masters +sentinel|sentinels +sentinel|slaves +sentinel|replicas +sentinel|ckquorum
EOF
	fi
	if [ "$REDIS_TLS_MODE" != off ]; then
		cat >>"$SENTINEL_CONF" <<EOF
tls-port $SENTINEL_TLS_PORT
tls-cert-file $REDIS_TLS_DIR/tls.crt
tls-key-file $REDIS_TLS_DIR/tls.key
tls-ca-cert-file $REDIS_TLS_DIR/ca.crt
tls-auth-clients no
EOF
	fi
	if [ "$REDIS_TLS_MODE" = required ]; then
		echo "tls-replication yes" >>"$SENTINEL_CONF"
	fi
	log "monitoring $master"
	exec redis-server "$SENTINEL_CONF" --sentinel
}

role="${1:-}"
[ $# -gt 0 ] && shift
case "$role" in
server) start_server "$@" ;;
acl-args) acl_args ;;
probe)
	case "${1:-}" in
	server) [ "$(node_cli -p "$REDIS_PORT" PING 2>/dev/null)" = "PONG" ] ;;
	sentinel) [ "$(sentinel_cli -p "$SENTINEL_PORT" PING 2>/dev/null)" = "PONG" ] ;;
	*) exit 64 ;;
	esac
	;;
sentinel) start_sentinel ;;
*)
	log "usage: redis-ha.sh server [redis-server args...] | sentinel | probe server|sentinel"
	exit 64
	;;
esac
