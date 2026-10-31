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
		.replace(
			/BINANCE_BASE_URL: "https:\/\/api\.binance\.com"/,
			'BINANCE_BASE_URL: "http://binance-stub:3000"'
		);
}

const documents = readFileSync(0, "utf8")
	.split(/^---$/m)
	.filter((doc) => !DROPPED_KINDS.test(doc))
	.map((doc) => (/^kind: CronJob$/m.test(doc) ? doc.replace(/^spec:\n/m, "spec:\n  suspend: true\n") : doc));
process.stdout.write(adapt(documents.join("---")));
