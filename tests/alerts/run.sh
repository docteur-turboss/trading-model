#!/usr/bin/env bash
# promtool checks of the alert rules: syntax of both rule files (compose and
# the K8s ConfigMap), then the unit tests of tests/alerts/alerting.test.yml.
# Uses a local promtool, or the Prometheus image of docker-compose.yml.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
WORK="$(mktemp -d)"
# Git Bash: a C:/... path works for bash and the native bun/docker alike.
if command -v cygpath >/dev/null; then WORK="$(cygpath -m "$WORK")"; fi
trap 'rm -rf "$WORK"' EXIT
# mktemp -d is 0700: the Prometheus image runs promtool as nobody.
chmod 755 "$WORK"

# The K8s rules, as Prometheus reads them from the ConfigMap.
bun -e '
const fs = require("node:fs");
for (const doc of fs.readFileSync("deploy/k8s/infra/prometheus.yaml", "utf8").split(/^---$/m)) {
	const data = Bun.YAML.parse(doc)?.data;
	if (data?.["alerting.yml"]) fs.writeFileSync(process.argv[1], data["alerting.yml"]);
}' "$WORK/k8s-alerting.yml"

run_promtool() {
	if command -v promtool >/dev/null; then
		command promtool "$@"
		return
	fi
	local image
	image="$(sed -n '/^  prometheus:/,/image:/s/^ *image: *//p' docker-compose.yml | head -1)"
	# Mounts the repository (relative rule paths) and the work dir; paths stay
	# inside the container: MSYS_NO_PATHCONV keeps Git Bash from rewriting them.
	local root="$ROOT" work="$WORK"
	if command -v cygpath >/dev/null; then
		root="$(cygpath -m "$ROOT")"
	fi
	MSYS_NO_PATHCONV=1 docker run --rm -v "${root}:/repo:ro" -v "${work}:/work:ro" -w /repo \
		--entrypoint promtool "$image" "$@"
}

if command -v promtool >/dev/null; then K8S_RULES="$WORK/k8s-alerting.yml"; else K8S_RULES=/work/k8s-alerting.yml; fi
run_promtool check rules observability/alerting.yml "$K8S_RULES"
run_promtool test rules tests/alerts/alerting.test.yml
