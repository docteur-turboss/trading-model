#!/usr/bin/env bash
# Waits for a Job to end: returns at once on `Complete` (exit 0) or `Failed`
# (exit 1), exit 2 at the timeout. `kubectl wait --for=condition=complete` sits
# out its whole timeout on a Job that already failed (issue #434). The Job logs
# are printed on failure and timeout.
#   wait-job.sh <namespace> <job> [timeout-seconds=180]
# WAIT_JOB_INTERVAL: poll period in seconds (default 2).
set -euo pipefail

NS="${1:?usage: wait-job.sh <namespace> <job> [timeout-seconds]}"
JOB="${2:?usage: wait-job.sh <namespace> <job> [timeout-seconds]}"
TIMEOUT="${3:-180}"
INTERVAL="${WAIT_JOB_INTERVAL:-2}"

deadline=$((SECONDS + TIMEOUT))
while :; do
	state=$(kubectl get "job/$JOB" -n "$NS" \
		-o jsonpath='{range .status.conditions[?(@.status=="True")]}{.type} {end}')
	case "$state" in
	*Complete*) exit 0 ;;
	*Failed*) result="failed" code=1 ;;
	*) result="" ;;
	esac
	if [ -n "$result" ]; then break; fi
	if [ "$SECONDS" -ge "$deadline" ]; then result="timed out after ${TIMEOUT}s"; code=2; break; fi
	sleep "$INTERVAL"
done
echo "::error::Job $JOB $result"
kubectl logs -n "$NS" "job/$JOB" --tail=50 || echo "Could not retrieve logs from job/$JOB" >&2
exit "$code"
