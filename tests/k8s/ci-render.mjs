// Adapts the rendered staging overlay (stdin) to a single kind node (stdout):
//   - drops VerticalPodAutoscalers (kind has no VPA CRD)
//   - drops HorizontalPodAutoscalers: the staging replicas (1) apply, no
//     metrics-server is needed
//   - uses the images loaded into the node (imagePullPolicy IfNotPresent)
//   - divides CPU requests by 4: the stack must fit a 4-vCPU CI runner; this
//     test checks behaviour, not capacity
//   - points the scraper at the in-cluster Binance stub
//   - suspends the CronJobs: a cluster kept after the test must not run the
//     nightly backup on the host disk (the drill starts its job by hand)
// Usage: kubectl kustomize ... | node tests/k8s/ci-render.mjs > out.yaml
import { readFileSync } from "node:fs";

const DROPPED_KINDS = /^kind: (VerticalPodAutoscaler|HorizontalPodAutoscaler)$/m;

function _quarterCpu(_match, indent, value, unit) {
	const millis = unit === "m" ? Number(value) : Number(value) * 1000;
	return `${indent}cpu: ${Math.max(1, Math.round(millis / 4))}m`;
}

function adapt(manifest) {
	return manifest
		.replace(/imagePullPolicy: Always/g, "imagePullPolicy: IfNotPresent")
		.replace(
			/(requests:\n\s+)cpu: "?(\d+(?:\.\d+)?)(m?)"?/g,
			(match, head, value, unit) => _quarterCpu(match, head, value, unit)
		)
		// kustomize drops the quotes of the ConfigMap value.
		.replace(
			/BINANCE_BASE_URL: "?https:\/\/api\.binance\.com"?/g,
			'BINANCE_BASE_URL: "http://binance-stub:3000"'
		);
}

// A silent miss sends the scraper to the real Binance (HTTP 451 from CI).
const STUB_URL = 'BINANCE_BASE_URL: "http://binance-stub:3000"';

const documents = readFileSync(0, "utf8")
	.split(/^---$/m)
	.filter((doc) => !DROPPED_KINDS.test(doc))
	.map((doc) => (/^kind: CronJob$/m.test(doc) ? doc.replace(/^spec:\n/m, "spec:\n  suspend: true\n") : doc));
const rendered = adapt(documents.join("---"));
if (!rendered.includes(STUB_URL) || /BINANCE_BASE_URL: "?https:/.test(rendered)) {
	process.stderr.write("ci-render: BINANCE_BASE_URL not pointed at the stub\n");
	process.exit(1);
}
process.stdout.write(rendered);
