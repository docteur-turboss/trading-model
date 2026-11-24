#!/usr/bin/env bash
# Sourced by run-kind.sh and tests/k8s/probe-availability.test.sh.
# Needs $K, $NS and $API_KEY.

# Public routes probed, one per service whose rollout must not cut its reads:
# discovery-server, trader-trainer (Lease handover, ADR-0058) and
# financial-scraper. PROBE_ROUTES (space-separated paths) overrides them.
PROBE_ROUTES="${PROBE_ROUTES:-/v1/trader-trainer/training-status /v2/financial-scraper/candles/symbols/BTCUSDT?limit=1}"

# Availability probe (issue #703). Every 3 s, one request to each of
# PROBE_ROUTES through edge-proxy, with the gateway key, until the file `$1`
# exists; writes "<requests> <failures>" to `$2` and each failure (route and
# status) to stderr. A failure is a non-2xx answer or a timeout.
# `kubectl port-forward` follows one pod and exits when it is replaced: the
# tunnel is restarted, and a request counts as failed only when it still fails
# after 3 retries (~3 s), so a restart of the tunnel is not an outage but a
# route without a ready pod is. The key goes through a curl config on stdin,
# never on a command line or in a log.
probe_availability() {
	local stop="$1" out="$2" port="${PROBE_PORT:-18452}" forward="" requests=0 failures=0 try code route routes
	# Split without globbing: a route may hold a `?`.
	read -ra routes <<<"$PROBE_ROUTES"
	while [ ! -e "$stop" ]; do
		for route in "${routes[@]}"; do
			code=000
			for try in 1 2 3; do
				if [ -z "$forward" ] || ! kill -0 "$forward" 2>/dev/null; then
					$K -n "$NS" port-forward svc/edge-proxy "$port:8080" >/dev/null 2>&1 &
					forward=$!
					sleep 1
				fi
				rm -f "$out.body"
				code="$(printf 'header = "x-api-key: %s"\n' "$API_KEY" |
					curl -s -o "$out.body" -w '%{http_code}' --max-time 2 -K - \
						"http://localhost:$port$route" || true)"
				[[ "$code" =~ ^2 ]] && break
				kill "$forward" 2>/dev/null || true
				forward=""
			done
			requests=$((requests + 1))
			if ! [[ "$code" =~ ^2 ]]; then
				failures=$((failures + 1))
				echo "probe: $route answered $code: $(head -c 300 "$out.body" 2>/dev/null | tr '\r\n' '  ')" >&2
			fi
			echo "$requests $failures" >"$out"
		done
		# 3 routes / 3 s = 60 req/min, under the gateway RATE_LIMIT_MAX of 100
		# per 60 s: at 1 s the probe itself got 429.
		sleep 3
	done
	kill "$forward" 2>/dev/null || true
}

# Waits up to ${PROBE_READY_TIMEOUT:-120} s for every route of PROBE_ROUTES to
# answer 2xx through edge-proxy, so a 404 that predates the upgrade fails here
# (with its body) and is not counted as a request the upgrade dropped.
probe_wait_ready() {
	local port="${PROBE_PORT:-18452}" deadline=$((SECONDS + ${PROBE_READY_TIMEOUT:-120})) code route routes body rc=0
	body="$(mktemp)"
	read -ra routes <<<"$PROBE_ROUTES"
	local forward=""
	for route in "${routes[@]}"; do
		while :; do
			# Same restart as probe_availability: the tunnel follows one pod.
			if [ -z "$forward" ] || ! kill -0 "$forward" 2>/dev/null; then
				$K -n "$NS" port-forward svc/edge-proxy "$port:8080" >/dev/null 2>&1 &
				forward=$!
				sleep 1
			fi
			: >"$body"
			code="$(printf 'header = "x-api-key: %s"\n' "$API_KEY" |
				curl -s -o "$body" -w '%{http_code}' --max-time 2 -K - \
					"http://localhost:$port$route" || true)"
			[[ "$code" =~ ^2 ]] && break
			[ "$code" != 000 ] || { kill "$forward" 2>/dev/null || true; forward=""; }
			if [ "$SECONDS" -ge "$deadline" ]; then
				echo "probe: $route not ready before the upgrade, answered $code: $(head -c 300 "$body" | tr '\r\n' '  ')" >&2
				rc=1
				break
			fi
			sleep 2
		done
	done
	kill "$forward" 2>/dev/null || true
	rm -f "$body"
	return "$rc"
}
