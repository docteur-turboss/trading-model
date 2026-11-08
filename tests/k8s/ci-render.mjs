// Adapts the rendered staging overlay (stdin) to a single kind node (stdout):
//   - drops VerticalPodAutoscalers (kind has no VPA CRD)
//   - drops HorizontalPodAutoscalers: the staging replicas (1) apply, no
//     metrics-server is needed
//   - replaces the SealedSecret trading-model-secrets with a Secret of test
//     values: kind has neither the controller nor its key (issue #417)
//   - uses the images loaded into the node (imagePullPolicy IfNotPresent)
//   - divides CPU requests by 4: the stack must fit a 4-vCPU CI runner; this
//     test checks behaviour, not capacity
//   - points the scraper at the in-cluster Binance stub
//   - scrapes every 10 s instead of every minute (collector handover gap)
//   - turns off the collection of the signal registry sources (real public
//     APIs, ADR-0036)
//   - sends the Pushover pages to the in-cluster alert sink (webhook)
//   - drops every internet egress rule (`ipBlock` 0.0.0.0/0) of the
//     NetworkPolicies: fail closed, a new outside call is refused in CI
//     instead of reaching the real service
//   - suspends the CronJobs: a cluster kept after the test must not run the
//     nightly backup on the host disk (the drill starts its job by hand)
// Usage: kubectl kustomize ... | node tests/k8s/ci-render.mjs > out.yaml
import { readFileSync } from "node:fs";

const DROPPED_KINDS = /^kind: (VerticalPodAutoscaler|HorizontalPodAutoscaler)$/m;

function _quarterCpu(_match, indent, value, unit) {
	const millis = unit === "m" ? Number(value) : Number(value) * 1000;
	return `${indent}cpu: ${Math.max(1, Math.round(millis / 4))}m`;
}

// Public test values, for the throwaway kind cluster only (run-kind.sh API_KEY).
const TEST_SECRET = `apiVersion: v1
kind: Secret
metadata:
  name: trading-model-secrets
  namespace: trading-model-staging
  labels:
    app.kubernetes.io/part-of: trading-model
type: Opaque
stringData:
  AUTH_TOKENS: dev-token-change-me
  SIGNING_SECRET: dev-signing-change-me
  SERVICE_BOOTSTRAP_TOKEN: dev-bootstrap-change-me
  MYSQL_ROOT_PASSWORD: dev-mysql-root
  MYSQL_PASSWORD: dev-mysql
  MYSQL_MIGRATE_PASSWORD: dev-mysql-migrate
  MYSQL_RETENTION_PASSWORD: dev-mysql-retention
  MYSQL_EXPORTER_PASSWORD: dev-mysql-exporter
  DLQ_AUTH_HMAC_SECRET: dev-dlq-hmac-change-me
  GRAFANA_PASSWORD: dev-grafana
  HMAC_SECRET: dev-hmac
  REDIS_INTERNAL_PASSWORD: dev-redis-internal-password
  REDIS_DISCOVERY_PASSWORD: dev-redis-discovery-password
  REDIS_MESSAGE_MANAGER_PASSWORD: dev-redis-message-manager-password
  REDIS_DLQ_PASSWORD: dev-redis-dlq-password
  REDIS_EXPORTER_PASSWORD: dev-redis-exporter-password
`;

// `--secret`: that Secret alone, the stand-in for the SealedSecret file deploy.yml
// passes to run-migrations.sh as SEALED_SECRETS_FILE (run-kind.sh, issue #698).
if (process.argv.includes("--secret")) {
	process.stdout.write(TEST_SECRET);
	process.exit(0);
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
		)
		// Pages to the alert sink: api.pushover.net is unreachable from CI, and a
		// failed page fires AlertmanagerNotificationsFailing, critical, so paged
		// again. Alertmanager has no setting for the Pushover endpoint (its `url`
		// is a link shown in the message), so the receiver becomes a webhook.
		.replace(
			/^( +)pushover_configs:\n(?:\1 .*\n)*/m,
			(_block, i) =>
				`${i}webhook_configs:\n${i}  - ${PUSHOVER_SINK}\n` +
				`${i}    send_resolved: true\n`
		)
		// A cycle every 10 s (the E2E overlay's), so the collector handover gap
		// measured by run-kind.sh (ADR-0057, < 30 s) is not hidden by the 1 min cadence.
		.replace(/SCRAPE_INTERVAL: '\*\/1 \* \* \* \*'/g, "SCRAPE_INTERVAL: '*/10 * * * * *'")
		.replace(
			/SIGNAL_COLLECTION_ENABLED: "?true"?/g,
			'SIGNAL_COLLECTION_ENABLED: "false"'
		)
		// An egress item: "  - " then its lines indented by 4 or more (kustomize layout).
		.replace(/^ {2}- .*\n(?: {4}.*\n)*/gm, (item) =>
			item.includes("cidr: 0.0.0.0/0") ? "" : item
		);
}

// A silent miss sends the scraper to the real Binance (HTTP 451 from CI).
const STUB_URL = 'BINANCE_BASE_URL: "http://binance-stub:3000"';
// Same for the signal sources: real public APIs, never called from CI runners.
const NO_SIGNALS = 'SIGNAL_COLLECTION_ENABLED: "false"';
const PUSHOVER_SINK = "url: http://alert-sink:8080/pushover";

const documents = readFileSync(0, "utf8")
	.split(/^---$/m)
	.filter((doc) => !DROPPED_KINDS.test(doc))
	.map((doc) => (/^kind: SealedSecret$/m.test(doc) ? `
${TEST_SECRET}` : doc))
	.map((doc) => (/^kind: CronJob$/m.test(doc) ? doc.replace(/^spec:\n/m, "spec:\n  suspend: true\n") : doc));
const rendered = adapt(documents.join("---"));
if (!rendered.includes(STUB_URL) || /BINANCE_BASE_URL: "?https:/.test(rendered)) {
	process.stderr.write("ci-render: BINANCE_BASE_URL not pointed at the stub\n");
	process.exit(1);
}
if (!rendered.includes(NO_SIGNALS) || /SIGNAL_COLLECTION_ENABLED: "?true/.test(rendered)) {
	process.stderr.write("ci-render: SIGNAL_COLLECTION_ENABLED not turned off\n");
	process.exit(1);
}
const PAGED = /name: critical-receiver/.test(rendered);
if (
	/pushover_configs:/.test(rendered) ||
	(PAGED && !rendered.includes(PUSHOVER_SINK))
) {
	process.stderr.write("ci-render: Pushover not pointed at the alert sink\n");
	process.exit(1);
}
if (/^kind: SealedSecret$/m.test(rendered)) {
	process.stderr.write("ci-render: a SealedSecret is left\n");
	process.exit(1);
}
if (rendered.includes("0.0.0.0/0")) {
	process.stderr.write("ci-render: an internet egress rule is left\n");
	process.exit(1);
}
process.stdout.write(rendered);
