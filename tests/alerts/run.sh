#!/usr/bin/env bash
# promtool checks of the alert rules: syntax of the rule file, then the unit tests of tests/alerts/alerting.test.yml.
# Uses a local promtool, or the Prometheus image of docker-compose.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
WORK="$(mktemp -d)"
# Git Bash: a C:/... path works for bash and the native bun/docker alike.
if command -v cygpath >/dev/null; then ROOT="$(cygpath -m "$ROOT")"; WORK="$(cygpath -m "$WORK")"; fi
trap 'rm -rf "$WORK"' EXIT
# mktemp -d is 0700: the Prometheus image runs promtool as nobody.
chmod 755 "$WORK"

if command -v promtool >/dev/null; then
	run_promtool() { promtool "$@"; }
else
	IMAGE="$(sed -n '/^  prometheus:/,/image:/s/^ *image: *//p' docker-compose.yml | head -1)"
	# Mounts the repository (relative rule paths) and the work dir; paths stay
	# inside the container: MSYS_NO_PATHCONV keeps Git Bash from rewriting them.
	run_promtool() {
		MSYS_NO_PATHCONV=1 docker run --rm -v "${ROOT}:/repo:ro" -v "${WORK}:/work:ro" -w /repo \
			--entrypoint promtool "$IMAGE" "$@"
	}
fi

run_promtool check rules deploy/k8s/infra/config/alerting.yml
run_promtool test rules tests/alerts/alerting.test.yml
