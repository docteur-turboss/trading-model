#!/usr/bin/env bash
# Result of a Deploy preflight (issue #805): one row per guard of deploy.yml in
# $GITHUB_STEP_SUMMARY (stdout when unset), exit 1 when any guard did not pass,
# so the preflight only passes when a real deploy would pass every known guard.
# Bash, not node: the staging deploy runs on a self-hosted runner.
#   CHECKS=$'<guard>=<outcome>\n...' bash scripts/preflight-summary.sh <environment> <image tag>
# Outcomes are GitHub step outcomes (success, failure, cancelled, skipped) or
# `warning`; skipped rows (the other environment's step) are left out, an empty
# or cancelled one is no pass. CHECKS holds names and outcomes only, never a
# secret value. Exit 2 when CHECKS holds no result.
set -euo pipefail

[ $# -eq 2 ] || { echo "usage: $0 <environment> <image tag>" >&2; exit 64; }
rows=() failed=()
while IFS= read -r line; do
	[[ $line == *=* ]] || continue
	name="${line%=*}" outcome="${line##*=}"
	name="${name#"${name%%[![:space:]]*}"}"
	[ -n "$name" ] && [ "$outcome" != skipped ] || continue
	case "$outcome" in
	success) result="pass" ;;
	warning) result="warning (does not block this environment)" ;;
	failure) result="**missing / failed**"; failed+=("$name") ;;
	*) result="**did not run (${outcome:-no result})**"; failed+=("$name") ;;
	esac
	rows+=("| $name | $result |")
done <<<"${CHECKS:-}"

[ ${#rows[@]} -gt 0 ] || { echo "preflight-summary: no guard result in CHECKS" >&2; exit 2; }
if [ ${#failed[@]} -gt 0 ]; then
	printf -v list '%s, ' "${failed[@]}"
	verdict="${#failed[@]} guard(s) would stop a real deploy: ${list%, }. Their errors are the annotations of the run."
else
	verdict="Every guard passes: a real deploy of this tag would not be stopped by a known prerequisite."
fi
summary() {
	printf '### Deploy preflight: %s %s\n\nNothing was applied: server-side dry-run only.\n\n| Guard | Result |\n|---|---|\n' "$1" "$2"
	printf '%s\n' "${rows[@]}"
	printf '\n%s\n' "$verdict"
}
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then summary "$@" >>"$GITHUB_STEP_SUMMARY"; else summary "$@"; fi
if [ ${#failed[@]} -gt 0 ]; then
	echo "::error::Preflight of $1: $verdict"
	exit 1
fi
echo "$verdict"
