#!/usr/bin/env bash
# Step timings of a restore drill (tests/k8s/run-kind.sh verify_backup,
# tests/backup/compose-restore-drill.sh). Sourced, never run.
#
#   drill_begin <drill>            start the clock (drill name: kind, docker)
#   drill_disaster                 the data is about to be destroyed: the
#                                  recovery window (what the budget limits)
#                                  starts here
#   drill_record <step> <seconds>  record a step measured elsewhere
#   drill_time <step> <cmd...>     run a command and record its duration
#   drill_finish <default budget>  write the JSON file and the GitHub step
#                                  summary, compare the recovery window with
#                                  the budget
#
# Environment:
#   DRILL_TIMINGS_FILE             JSON output (default ./restore-drill-timings.json)
#   RESTORE_DRILL_BUDGET_SECONDS   budget of the recovery window (disaster to
#                                  checks done); unset = the default of the
#                                  drill, 0 = no budget
#   RESTORE_DRILL_BUDGET_MODE      fail (default: exit 1 when exceeded) or
#                                  warn (::warning:: and exit 0)
#
# The budgets are deliberately wide in CI (kind on a shared runner is far
# slower than production and nothing there is sized like production): they
# catch a drill that explodes (an unbounded dump, a hung step), not a drift
# of a few minutes. The trend is in restore-drill-timings.json (artifact).
# Real recovery time is judged against the RTO in docs/deployment/BACKUP_DR.md
# and logged in docs/compliance/dr-exercise-log.md.

DRILL_STEP_NAMES=()
DRILL_STEP_SECONDS=()
DRILL_NAME=""
DRILL_STARTED=0
DRILL_DISASTER_AT=""

drill_begin() {
	DRILL_NAME="$1"
	DRILL_STEP_NAMES=()
	DRILL_STEP_SECONDS=()
	DRILL_STARTED=$SECONDS
	DRILL_DISASTER_AT=""
}

drill_disaster() {
	DRILL_DISASTER_AT=$SECONDS
}

drill_record() {
	DRILL_STEP_NAMES+=("$1")
	DRILL_STEP_SECONDS+=("$2")
}

drill_time() {
	local step="$1" started=$SECONDS rc=0
	shift
	"$@" || rc=$?
	drill_record "$step" $((SECONDS - started))
	return "$rc"
}

# Records the `restore-timing component=<c> seconds=<n>` lines that
# scripts/restore-k8s.sh logs, read from the file $1 (its captured output).
drill_record_components() {
	local line component seconds
	while IFS= read -r line; do
		component="$(echo "$line" | sed -n 's/.*restore-timing component=\([a-z-]*\) seconds=\([0-9]*\).*/\1/p')"
		seconds="$(echo "$line" | sed -n 's/.*restore-timing component=\([a-z-]*\) seconds=\([0-9]*\).*/\2/p')"
		[ -n "$component" ] || continue
		drill_record "restore_${component}" "$seconds"
	done <"$1"
}

drill_finish() {
	local default_budget="$1"
	local total=$((SECONDS - DRILL_STARTED))
	local recovery="$total"
	[ -z "$DRILL_DISASTER_AT" ] || recovery=$((SECONDS - DRILL_DISASTER_AT))
	local budget="${RESTORE_DRILL_BUDGET_SECONDS:-$default_budget}"
	local mode="${RESTORE_DRILL_BUDGET_MODE:-fail}"
	local file="${DRILL_TIMINGS_FILE:-restore-drill-timings.json}"
	case "$mode" in
	fail | warn) ;;
	*)
		echo "[drill] RESTORE_DRILL_BUDGET_MODE must be fail or warn, got '$mode'" >&2
		return 1
		;;
	esac
	case "$budget" in
	'' | *[!0-9]*)
		echo "[drill] RESTORE_DRILL_BUDGET_SECONDS must be a number of seconds, got '$budget'" >&2
		return 1
		;;
	esac

	local exceeded=false
	{ [ "$budget" -gt 0 ] && [ "$recovery" -gt "$budget" ]; } && exceeded=true

	local i sep="" json_steps=""
	for i in "${!DRILL_STEP_NAMES[@]}"; do
		json_steps+="${sep}\"${DRILL_STEP_NAMES[$i]}\": ${DRILL_STEP_SECONDS[$i]}"
		sep=", "
	done
	printf '{"drill": "%s", "date": "%s", "steps_seconds": {%s}, "total_seconds": %s, "recovery_seconds": %s, "budget_seconds": %s, "budget_mode": "%s", "budget_exceeded": %s}\n' \
		"$DRILL_NAME" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$json_steps" "$total" "$recovery" "$budget" "$mode" "$exceeded" >"$file"

	echo "[drill] timings of the ${DRILL_NAME} drill (seconds):"
	for i in "${!DRILL_STEP_NAMES[@]}"; do
		printf '[drill]   %-28s %6s\n' "${DRILL_STEP_NAMES[$i]}" "${DRILL_STEP_SECONDS[$i]}"
	done
	printf '[drill]   %-28s %6s\n[drill]   %-28s %6s (budget %s, mode %s)\n' \
		"total" "$total" "recovery (disaster to checks)" "$recovery" "$budget" "$mode"

	if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
		{
			echo "### Restore drill: ${DRILL_NAME}"
			echo ""
			echo "| Step | Seconds |"
			echo "| --- | ---: |"
			for i in "${!DRILL_STEP_NAMES[@]}"; do
				echo "| ${DRILL_STEP_NAMES[$i]} | ${DRILL_STEP_SECONDS[$i]} |"
			done
			echo "| **total** | **${total}** |"
			echo "| **recovery (disaster to checks)** | **${recovery}** |"
			echo ""
			if [ "$budget" -gt 0 ]; then
				echo "Budget ${budget} s (${mode}): $($exceeded && echo EXCEEDED || echo respected)."
			else
				echo "No budget (RESTORE_DRILL_BUDGET_SECONDS=0)."
			fi
		} >>"$GITHUB_STEP_SUMMARY"
	fi

	if $exceeded; then
		local message="${DRILL_NAME} restore drill: recovery took ${recovery} s, over the budget of ${budget} s (RESTORE_DRILL_BUDGET_SECONDS)"
		if [ "$mode" = fail ]; then
			echo "::error::${message}"
			return 1
		fi
		echo "::warning::${message}"
	fi
	return 0
}
