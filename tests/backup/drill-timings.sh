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
# A drill that dies half way still publishes what it measured: drill_begin
# chains an EXIT trap (kept after any trap already set) that writes the JSON
# and the summary with "status": "failed" and the steps done so far, and keeps
# the exit status of the drill. A stuck step is the case where the timings
# matter most.
#
# Environment:
#   DRILL_TIMINGS_FILE             JSON output (default ./restore-drill-timings.json)
#   RESTORE_DRILL_BUDGET_SECONDS   budget of the recovery window (disaster to
#                                  checks done); unset = the default of the
#                                  drill, 0 = no budget
#   RESTORE_DRILL_BUDGET_MODE      fail (default: exit 1 when exceeded) or
#                                  warn (::warning:: and exit 0)
#
# Default budgets come from the first CI run of the drills (run 41643357917,
# docs/compliance/dr-exercise-log.md): recovery window 252 s on kind, 20 s on
# Docker. Rule: about 5 times the measured window, rounded, so that a step
# that doubles or hangs is caught while the writers' drain wait (kind, up to
# 7 minutes) and image pulls (Docker) do not fail a healthy run: kind 1200 s,
# Docker 300 s. Kind on a shared runner is not sized like production: the
# budget guards against a blow-up (an unbounded dump, a hung step), it is not
# the RTO. Review the values when the log shows a new baseline.
# The trend is in restore-drill-timings.json (artifact).
# Real recovery time is judged against the RTO in docs/deployment/BACKUP_DR.md
# and logged in docs/compliance/dr-exercise-log.md.

DRILL_STEP_NAMES=()
DRILL_STEP_SECONDS=()
DRILL_NAME=""
DRILL_STARTED=0
DRILL_DISASTER_AT=""
DRILL_FINISHED=false
DRILL_ABORTED=false
DRILL_TRAP_SET=false

drill_begin() {
	DRILL_NAME="$1"
	DRILL_STEP_NAMES=()
	DRILL_STEP_SECONDS=()
	DRILL_STARTED=$SECONDS
	DRILL_DISASTER_AT=""
	DRILL_FINISHED=false
	DRILL_ABORTED=false
	drill_install_exit_trap
}

drill_disaster() {
	DRILL_DISASTER_AT=$SECONDS
}

# Step names go into the JSON as keys: keep them to [A-Za-z0-9_-].
drill_record() {
	DRILL_STEP_NAMES+=("${1//[^A-Za-z0-9_-]/_}")
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

# Chains drill_abort_report in front of the EXIT trap already set (once).
drill_install_exit_trap() {
	$DRILL_TRAP_SET && return 0
	DRILL_TRAP_SET=true
	local previous
	previous="$(trap -p EXIT)"
	if [ -n "$previous" ]; then
		eval "set -- ${previous#trap }"
		previous="$2"
	fi
	# shellcheck disable=SC2064
	# set +e: a failing drill (status != 0) must not stop the trap before the
	# earlier one; (exit rc) hands the status of the drill back to it as $?.
	trap "drill_rc=\$?; set +e; drill_abort_report; (exit \$drill_rc); ${previous}" EXIT
}

# EXIT hook: a drill that did not reach drill_finish publishes its partial
# timings. Keeps the exit status it was called with.
drill_abort_report() {
	local rc=$?
	if [ -n "$DRILL_NAME" ] && ! $DRILL_FINISHED; then
		DRILL_FINISHED=true
		DRILL_ABORTED=true
		drill_publish failed 0 false fail || true
	fi
	return "$rc"
}

# drill_publish <status> <budget> <exceeded> <mode>: JSON file, log lines and
# GitHub step summary.
drill_publish() {
	local status="$1" budget="$2" exceeded="$3" mode="$4"
	local total=$((SECONDS - DRILL_STARTED))
	local recovery="$total"
	[ -z "$DRILL_DISASTER_AT" ] || recovery=$((SECONDS - DRILL_DISASTER_AT))
	local file="${DRILL_TIMINGS_FILE:-restore-drill-timings.json}"
	local i sep="" json_steps=""
	for i in "${!DRILL_STEP_NAMES[@]}"; do
		json_steps+="${sep}\"${DRILL_STEP_NAMES[$i]}\": ${DRILL_STEP_SECONDS[$i]}"
		sep=", "
	done
	printf '{"drill": "%s", "status": "%s", "date": "%s", "steps_seconds": {%s}, "total_seconds": %s, "recovery_seconds": %s, "budget_seconds": %s, "budget_mode": "%s", "budget_exceeded": %s}
' 		"${DRILL_NAME//[^A-Za-z0-9_-]/_}" "$status" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$json_steps" "$total" "$recovery" "$budget" "$mode" "$exceeded" >"$file"

	echo "[drill] timings of the ${DRILL_NAME} drill (${status}, seconds):"
	for i in "${!DRILL_STEP_NAMES[@]}"; do
		printf '[drill]   %-28s %6s
' "${DRILL_STEP_NAMES[$i]}" "${DRILL_STEP_SECONDS[$i]}"
	done
	printf '[drill]   %-28s %6s
[drill]   %-28s %6s (budget %s, mode %s)
' 		"total" "$total" "recovery (disaster to checks)" "$recovery" "$budget" "$mode"

	if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
		{
			echo "### Restore drill: ${DRILL_NAME} (${status})"
			echo ""
			echo "| Step | Seconds |"
			echo "| --- | ---: |"
			for i in "${!DRILL_STEP_NAMES[@]}"; do
				echo "| ${DRILL_STEP_NAMES[$i]} | ${DRILL_STEP_SECONDS[$i]} |"
			done
			echo "| **total** | **${total}** |"
			echo "| **recovery (disaster to checks)** | **${recovery}** |"
			echo ""
			if $DRILL_ABORTED; then
				echo "The drill stopped before its end: the steps above are the ones done."
			elif [ "$budget" -gt 0 ]; then
				echo "Budget ${budget} s (${mode}): $([ "$exceeded" = true ] && echo EXCEEDED || echo respected)."
			else
				echo "No budget (RESTORE_DRILL_BUDGET_SECONDS=0)."
			fi
		} >>"$GITHUB_STEP_SUMMARY"
	fi
}

drill_finish() {
	local default_budget="$1"
	local budget="${RESTORE_DRILL_BUDGET_SECONDS:-$default_budget}"
	local mode="${RESTORE_DRILL_BUDGET_MODE:-fail}"
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
	DRILL_FINISHED=true

	local recovery=$((SECONDS - DRILL_STARTED))
	[ -z "$DRILL_DISASTER_AT" ] || recovery=$((SECONDS - DRILL_DISASTER_AT))
	local exceeded=false status=passed
	{ [ "$budget" -gt 0 ] && [ "$recovery" -gt "$budget" ]; } && exceeded=true
	{ $exceeded && [ "$mode" = fail ]; } && status=failed
	drill_publish "$status" "$budget" "$exceeded" "$mode"

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
