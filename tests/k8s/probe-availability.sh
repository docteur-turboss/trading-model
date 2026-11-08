#!/usr/bin/env bash
# Sourced by run-kind.sh and tests/k8s/probe-availability.test.sh.
# Needs $K, $NS and $API_KEY.

# Availability probe (issue #703). One request per second to a public route
# through edge-proxy, with the gateway key, until the file `$1` exists; writes
# "<requests> <failures>" to `$2`. A failure is a non-2xx answer or a timeout.
# `kubectl port-forward` follows one pod and exits when it is replaced: the
# tunnel is restarted, and a request counts as failed only when it still fails
# after 3 retries (~3 s), so a restart of the tunnel is not an outage but a
# route without a ready pod is. The key goes through a curl config on stdin,
# never on a command line or in a log.
probe_availability() {
	local stop="$1" out="$2" port="${PROBE_PORT:-18452}" forward="" requests=0 failures=0 try code
	while [ ! -e "$stop" ]; do
		code=000
		for try in 1 2 3; do
			if [ -z "$forward" ] || ! kill -0 "$forward" 2>/dev/null; then
				$K -n "$NS" port-forward svc/edge-proxy "$port:8080" >/dev/null 2>&1 &
				forward=$!
				sleep 1
			fi
			code="$(printf 'header = "x-api-key: %s"\n' "$API_KEY" |
				curl -s -o /dev/null -w '%{http_code}' --max-time 2 -K - \
					"http://localhost:$port/v1/discovery-server/services" || true)"
			[[ "$code" =~ ^2 ]] && break
			kill "$forward" 2>/dev/null || true
			forward=""
		done
		requests=$((requests + 1))
		[[ "$code" =~ ^2 ]] || failures=$((failures + 1))
		echo "$requests $failures" >"$out"
		sleep 1
	done
	kill "$forward" 2>/dev/null || true
}
