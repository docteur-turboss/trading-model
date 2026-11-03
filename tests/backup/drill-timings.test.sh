#!/usr/bin/env bash
# Tests of tests/backup/drill-timings.sh: JSON content, GitHub summary, budget
# (fail / warn / disabled), invalid settings, component timings read from the
# output of scripts/restore-k8s.sh (issue #329).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
FAILURES=0

# shellcheck source=drill-timings.sh
source "$ROOT/tests/backup/drill-timings.sh"

check() {
	local name="$1"
	shift
	if "$@"; then echo "  ✓ $name"; else echo "  ✗ $name"; FAILURES=$((FAILURES + 1)); fi
}

json_field() { node -e 'const v = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")); console.log(String(process.argv[2].split(".").reduce((o, k) => o[k], v)))' "$1" "$2"; }

# Runs a drill of `$1` seconds of recovery in a subshell with the given env;
# prints nothing, returns drill_finish's status.
run_drill() {
	local recovery="$1" default_budget="$2"
	(
		export DRILL_TIMINGS_FILE="$WORK/timings.json" GITHUB_STEP_SUMMARY="$WORK/summary.md"
		drill_begin test
		drill_record backup 3
		drill_disaster
		SECONDS=$((SECONDS + recovery))
		drill_record fetch_offsite 5
		drill_finish "$default_budget"
	) >"$WORK/out.txt" 2>&1
}

rm -f "$WORK/summary.md"
check "within budget: exit 0" run_drill 10 100
check "JSON: drill name" test "$(json_field "$WORK/timings.json" drill)" = test
check "JSON: step seconds" test "$(json_field "$WORK/timings.json" steps_seconds.fetch_offsite)" = 5
check "JSON: recovery measured from the disaster" test "$(json_field "$WORK/timings.json" recovery_seconds)" -ge 10
check "JSON: budget not exceeded" test "$(json_field "$WORK/timings.json" budget_exceeded)" = false
check "summary: table row" grep -q '^| fetch_offsite | 5 |$' "$WORK/summary.md"
check "summary: budget respected" grep -q 'respected' "$WORK/summary.md"

over_budget() { ! run_drill 10 5; }
check "over budget: exit 1 by default" over_budget
check "over budget: ::error:: annotation" grep -q '^::error::test restore drill' "$WORK/out.txt"
check "JSON: budget exceeded" test "$(json_field "$WORK/timings.json" budget_exceeded)" = true

warn_mode() { RESTORE_DRILL_BUDGET_MODE=warn run_drill 10 5; }
check "warn mode: exit 0" warn_mode
check "warn mode: ::warning:: annotation" grep -q '^::warning::test restore drill' "$WORK/out.txt"

no_budget() { RESTORE_DRILL_BUDGET_SECONDS=0 run_drill 10 5; }
check "budget 0: no check" no_budget

env_budget() { RESTORE_DRILL_BUDGET_SECONDS=1000 run_drill 10 5; }
check "RESTORE_DRILL_BUDGET_SECONDS overrides the default" env_budget

bad_mode() { ! RESTORE_DRILL_BUDGET_MODE=ignore run_drill 1 100; }
check "unknown mode refused" bad_mode
bad_budget() { ! RESTORE_DRILL_BUDGET_SECONDS=soon run_drill 1 100; }
check "non-numeric budget refused" bad_budget

cat >"$WORK/restore.log" <<'LOG'
[10:00:00] ✓ Every component checked: restoring
[10:00:05] ✓ MongoDB restore complete
[10:00:05] restore-timing component=mongodb seconds=5
[10:01:05] restore-timing component=mysql seconds=60
[10:01:06] restore-timing component=spire seconds=1
[10:01:06] restore-timing component=total seconds=66
LOG
components() {
	(
		drill_begin test
		drill_record_components "$WORK/restore.log"
		[ "${DRILL_STEP_NAMES[*]}" = "restore_mongodb restore_mysql restore_spire restore_total" ] &&
			[ "${DRILL_STEP_SECONDS[*]}" = "5 60 1 66" ]
	)
}
check "restore-k8s.sh timing lines recorded per component" components

[ "$FAILURES" -eq 0 ] || {
	echo "$FAILURES check(s) failed"
	exit 1
}
echo "OK: restore drill timings"
