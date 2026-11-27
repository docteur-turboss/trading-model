// Static checks of the rendered overlays, for the environments CI never
// deploys (production) as much as for staging:
//   - every overlay renders
//   - every first-party image (ghcr.io/trading-model/<image>) is published by
//     release.yml and rewritten by deploy.yml (IMAGES): an image missing there
//     would stay on the logical name, which no registry serves (release.yml
//     builds and signs exactly the deploy.yml IMAGES entries)
//   - every overlay gets its application secrets from SealedSecrets only, never
//     from a plain Secret (issue #417); staging-local renders no AgCHANGE_ME
//     placeholder (issue #1065)
//   - no PodDisruptionBudget of staging demands more pods than staging runs
//     (its drains would block)
//   - no Deployment driven by an HPA sets spec.replicas: every apply would reset
//     the pod count the HPA chose (issue #416)
//   - every Deployment that can run more than one pod (replicas or its HPA)
//     spreads them across nodes (ADR-0024): otherwise one node can hold every
//     replica and its loss takes the whole service down
//   - every RollingUpdate Deployment that can run one pod (replicas 1 or HPA
//     minReplicas 1) has an effective maxUnavailable of 0: it surges first
//     instead of leaving no ready pod during a rollout (issue #699)
//   - singleton Deployments (SINGLETONS) run one pod and work only while
//     holding a Lease: replicas: 1, RollingUpdate maxUnavailable 0 / maxSurge 1,
//     no HPA, no canary in deploy.yml, the Lease exists, its name is in the
//     singleton's lease variable, and the Role bound to the pod's
//     ServiceAccount grants only get/update on it (ADR-0057 collector,
//     ADR-0058 trainer)
//   - the data StatefulSets of staging-local (DATA_STATEFULSETS) set a
//     partition >= replicas, so a release never restarts their single pods;
//     staging (CI keeps testing their restarts) and production set none
//     (issue #700); they mount no ConfigMap by a bare name: a
//     restarted partitioned pod would read the newest release's content, not
//     its revision's (issues #1456, #1460)
//   - the deploy identities (ADR-0041) cover what the overlays apply: every
//     kind of the application overlay is in deploy-identity/app-role.yaml (or,
//     for the cluster-scope ones, cluster-role.yaml), every kind of the
//     node-agents overlay in node-role.yaml or cluster-role.yaml
//   - risk-execution stays replicas: 1, strategy Recreate, no HPA: one writer
//     of its volume, the rollout pause is accepted (ADR-0064 §10, issue #2879)
//   - mongo-audit runs a bootstrap script that adds every pod to the replica set (issue #2197)
// Usage: node tests/k8s/check-overlays.mjs   (needs kubectl)
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const OVERLAYS = ["staging", "staging-local", "production"];
const SEALED_ONLY = ["trading-model-secrets"];
// Deployments that must never work twice at once -> the ADR that says why, their
// Lease and the variable naming it: one pod at rest, two during a rollout, only
// the Lease holder works.
const SINGLETONS = {
	"trader-trainer": { adr: "ADR-0058", lease: "trader-trainer", env: "TRAINER_LEASE_NAME" },
	"financial-scraper-collector": { adr: "ADR-0057", lease: "financial-scraper-collector", env: "COLLECTOR_LEASE_NAME" },
};
// Data and observability StatefulSets of staging-local held by a partition (issue #700).
// Not prometheus nor alertmanager: a held pod keeps the rules and scrape jobs of an old release (issue #2323).
const DATABASES = ["mysql", "redis", "redis-sentinel", "mongo-audit"];
const DATA_STATEFULSETS = [...DATABASES, "grafana", "loki"];
// Bare names a database may mount: also applied by name outside kustomize (run-migrations.sh), read by the exporter sidecar only.
const BARE_CONFIGMAPS = new Set(["mysql-client-tls"]);
const IMAGE = /image: ghcr\.io\/trading-model\/([a-z0-9-]+)/g;

function render(dir) {
	return execFileSync(
		"kubectl",
		["kustomize", "--load-restrictor", "LoadRestrictionsNone", dir],
		{ encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
	);
}

function documents(yaml) {
	return yaml.split(/^---$/m).map((doc) => ({
		kind: doc.match(/^kind: (\S+)$/m)?.[1],
		name: doc.match(/^metadata:\n(?: {2}.*\n)*? {2}name: (\S+)$/m)?.[1],
		text: doc,
	}));
}

/** A hard spread across nodes (kustomize sorts the keys of each constraint). */
function spreadsAcrossNodes(text) {
	const block = text.match(/^( *)topologySpreadConstraints:\n((?:\1[ -].*\n)+)/m);
	if (!block) return false;
	return block[2]
		.split(new RegExp(`^${block[1]}- `, "m"))
		.some(
			(item) =>
				/\bmaxSkew: 1$/m.test(item) &&
				/\btopologyKey: kubernetes\.io\/hostname$/m.test(item) &&
				/\bwhenUnsatisfiable: DoNotSchedule$/m.test(item),
		);
}

/** Deployment name -> maxReplicas (or `field`) of the HPA that drives it. */
function hpaTargets(docs, field = "maxReplicas") {
	const replicas = new Map();
	for (const doc of docs.filter((d) => d.kind === "HorizontalPodAutoscaler")) {
		const target = doc.text.match(/scaleTargetRef:\n(?: {4}.*\n)*? {4}name: (\S+)$/m)?.[1];
		const count = Number(doc.text.match(new RegExp(`^ {2}${field}: (\\d+)$`, "m"))?.[1] ?? 1);
		if (target) replicas.set(target, count);
	}
	return replicas;
}

/**
 * RollingUpdate Deployments that can run one pod and would take it down before
 * its replacement is ready (issue #699). Kubernetes rounds a percentage
 * maxUnavailable down (default 25%), so only its effective value counts.
 */
function unavailableSinglePods(docs) {
	const minReplicas = hpaTargets(docs, "minReplicas");
	return docs
		.filter((doc) => doc.kind === "Deployment" && !/^ {4}type: Recreate$/m.test(doc.text))
		.filter((doc) => (minReplicas.get(doc.name) ?? Number(doc.text.match(/^ {2}replicas: (\d+)$/m)?.[1] ?? 1)) === 1)
		.filter((doc) => {
			const value = doc.text.match(/^ {6}maxUnavailable: (\S+)$/m)?.[1]?.replace(/["']/g, "") ?? "25%";
			return value.endsWith("%") ? Number.parseInt(value, 10) >= 100 : Number(value) > 0;
		})
		.map((doc) => doc.name);
}

/** Deployments that may run several pods without a hard spread across nodes. */
function unspreadDeployments(docs) {
	const maxReplicas = hpaTargets(docs);
	return docs
		.filter((doc) => doc.kind === "Deployment")
		.filter((doc) => {
			const replicas = Number(doc.text.match(/^ {2}replicas: (\d+)$/m)?.[1] ?? 1);
			return Math.max(replicas, maxReplicas.get(doc.name) ?? 0) > 1;
		})
		.filter((doc) => !spreadsAcrossNodes(doc.text))
		.map((doc) => doc.name);
}

const CLUSTER_KINDS = new Set(["Namespace", "ClusterRole", "ClusterRoleBinding", "CSIDriver"]);
// kind -> [apiGroup, resource]
const RESOURCES = {
	ConfigMap: ["", "configmaps"], Secret: ["", "secrets"], Service: ["", "services"],
	PersistentVolumeClaim: ["", "persistentvolumeclaims"], ServiceAccount: ["", "serviceaccounts"],
	ResourceQuota: ["", "resourcequotas"], LimitRange: ["", "limitranges"],
	Deployment: ["apps", "deployments"], StatefulSet: ["apps", "statefulsets"], DaemonSet: ["apps", "daemonsets"],
	CronJob: ["batch", "cronjobs"], Job: ["batch", "jobs"],
	Ingress: ["networking.k8s.io", "ingresses"], NetworkPolicy: ["networking.k8s.io", "networkpolicies"],
	PodDisruptionBudget: ["policy", "poddisruptionbudgets"],
	HorizontalPodAutoscaler: ["autoscaling", "horizontalpodautoscalers"],
	VerticalPodAutoscaler: ["autoscaling.k8s.io", "verticalpodautoscalers"],
	Lease: ["coordination.k8s.io", "leases"],
	Role: ["rbac.authorization.k8s.io", "roles"], RoleBinding: ["rbac.authorization.k8s.io", "rolebindings"],
	ClusterRole: ["rbac.authorization.k8s.io", "clusterroles"],
	ClusterRoleBinding: ["rbac.authorization.k8s.io", "clusterrolebindings"],
	SealedSecret: ["bitnami.com", "sealedsecrets"], Namespace: ["", "namespaces"],
	CSIDriver: ["storage.k8s.io", "csidrivers"],
	Issuer: ["cert-manager.io", "issuers"], Certificate: ["cert-manager.io", "certificates"],
};

/** "group/resource" pairs of a flow-style rules file (deploy/k8s/deploy-identity). */
function grantedResources(file) {
	const granted = new Set();
	const text = readFileSync(`deploy/k8s/deploy-identity/${file}`, "utf8");
	for (const [, groups, resources] of text.matchAll(/apiGroups: \[([^\]]*)\]\n\s+(?:resourceNames: \[[^\]]*\]\n\s+)?resources: \[([^\]]*)\]/g)) {
		for (const g of groups.split(",")) {
			for (const r of resources.split(",")) granted.add(`${g.trim().replace(/"/g, "")}/${r.trim()}`);
		}
	}
	return granted;
}

/** Kinds of docs that the identity files do not let the deploy apply. */
function uncoveredKinds(docs, namespacedFile) {
	const cluster = grantedResources("cluster-role.yaml");
	const namespaced = grantedResources(namespacedFile);
	const missing = new Set();
	for (const { kind } of docs.filter((d) => d.kind)) {
		const [group, resource] = RESOURCES[kind] ?? [];
		if (!resource) missing.add(`${kind} (unknown kind: add it to RESOURCES)`);
		else if (!(CLUSTER_KINDS.has(kind) ? cluster : namespaced).has(`${group}/${resource}`)) missing.add(kind);
	}
	return [...missing];
}

/** Deployments driven by an HPA that still set spec.replicas. */
function replicasUnderHpa(docs) {
	const targets = hpaTargets(docs);
	return docs
		.filter((doc) => doc.kind === "Deployment" && targets.has(doc.name))
		.filter((doc) => /^ {2}replicas: \d+$/m.test(doc.text))
		.map((doc) => doc.name);
}

/** Why a leased singleton could work twice at once or leave a gap during a rollout. */
function leaseViolations(docs, deployment, { adr, lease, env }) {
	const errors = [];
	const name = deployment.name;
	if (!/^ {2}strategy:\n {4}rollingUpdate:\n {6}maxSurge: 1\n {6}maxUnavailable: 0\n {4}type: RollingUpdate$/m.test(deployment.text)) {
		errors.push(`Deployment ${name} must use RollingUpdate maxUnavailable 0 / maxSurge 1 (${adr}: the new pod is ready before the old one releases the Lease)`);
	}
	if (!new RegExp(`- name: ${env}\\n\\s+value: "?${lease}"?$`, "m").test(deployment.text)) {
		errors.push(`Deployment ${name} must set ${env}=${lease} (${adr}: without it every pod works)`);
	}
	if (!docs.some((doc) => doc.kind === "Lease" && doc.name === lease)) {
		errors.push(`Lease ${lease} not found (${adr}: the Role grants no create)`);
	}
	const account = deployment.text.match(/^ {6}serviceAccountName: (\S+)$/m)?.[1];
	const bound = docs
		.filter((doc) => doc.kind === "RoleBinding" && new RegExp(`- kind: ServiceAccount\\n\\s+name: ${account}$`, "m").test(doc.text))
		.map((doc) => doc.text.match(/^roleRef:\n(?: {2}.*\n)*? {2}name: (\S+)$/m)?.[1]);
	// kustomize layout: one rule = "- apiGroups:" at column 0 under "rules:".
	const limited = docs.some((doc) => {
		const rules = doc.text.match(/^rules:\n((?:[- ].*\n?)+)/m)?.[1] ?? "";
		return (
			doc.kind === "Role" &&
			bound.includes(doc.name) &&
			(rules.match(/^- /gm) ?? []).length === 1 &&
			rules.trimEnd().endsWith(`resourceNames:\n  - ${lease}\n  resources:\n  - leases\n  verbs:\n  - get\n  - update`)
		);
	});
	if (!limited) {
		errors.push(`ServiceAccount ${account} of ${name} needs a Role limited to get/update on Lease ${lease} (${adr})`);
	}
	return errors;
}

/** Why each singleton Deployment could run more than one pod (empty when sound). */
function singletonViolations(docs) {
	const errors = [];
	for (const [name, singleton] of Object.entries(SINGLETONS)) {
		const { adr } = singleton;
		const deployment = docs.find((doc) => doc.kind === "Deployment" && doc.name === name);
		if (!deployment) {
			errors.push(`singleton Deployment ${name} not found (${adr})`);
			continue;
		}
		if (!/^ {2}replicas: 1$/m.test(deployment.text)) {
			errors.push(`Deployment ${name} must set replicas: 1 (${adr}: singleton)`);
		}
		errors.push(...leaseViolations(docs, deployment, singleton));
		const scaled = docs.some(
			(doc) =>
				doc.kind === "HorizontalPodAutoscaler" &&
				doc.text.match(/scaleTargetRef:\n(?: {4}.*\n)*? {4}name: (\S+)$/m)?.[1] === name,
		);
		if (scaled) errors.push(`Deployment ${name} must have no HorizontalPodAutoscaler (${adr}: singleton)`);
	}
	return errors;
}

function deployImages() {
	const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
	const block = workflow.match(/^ {2}IMAGES: >-\n((?: {4}.*\n)+)/m);
	if (!block) throw new Error("deploy.yml: env IMAGES not found");
	return new Set(block[1].trim().split(/\s+/));
}

/** Singletons named by a deploy.yml step that runs `deploy-k8s.sh canary*`: a canary is a second pod. */
function canarySingletons() {
	const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
	const errors = [];
	for (const step of workflow.split(/^ {6}- name: /m).filter((text) => /deploy-k8s\.sh canary/.test(text))) {
		const code = step.replace(/#.*$/gm, "");
		for (const [name, { adr }] of Object.entries(SINGLETONS)) {
			if (new RegExp(`(?<![\\w-])${name}(?![\\w-])`).test(code)) {
				errors.push(`deploy.yml step "${step.split("\n")[0]}": singleton ${name} must get no canary (${adr}: it would run a second pod)`);
			}
		}
	}
	return errors;
}

const errors = [...canarySingletons()];
const deployed = deployImages();
// release.yml derives services from IMAGES; tools stay hard-coded `include` entries.
const releaseTools = new Set([...readFileSync(".github/workflows/release.yml", "utf8").matchAll(/^ {10}- image: (\S+)$/gm)].map((m) => m[1]));
for (const image of deployed) {
	if (!existsSync(`services/${image}`) && !releaseTools.has(image)) {
		errors.push(`deploy.yml IMAGES: ${image} is built by release.yml neither as a service (services/${image}/) nor as a tool (- image: ${image})`);
	}
}
for (const env of OVERLAYS) {
	const app = render(`deploy/k8s/overlays/${env}`);
	const nodeAgents = render(`deploy/k8s/overlays/${env}/node-agents`);
	const rendered = [app, nodeAgents].join("\n---\n");
	const docs = documents(rendered);

	for (const [, image] of rendered.matchAll(IMAGE)) {
		if (!deployed.has(image)) {
			errors.push(`${env}: image ${image} is not in deploy.yml IMAGES`);
		}
	}

	// Issue #433: the images that deliver mTLS identities are pinned by digest;
	// so are the infrastructure exporters (ADR-0056), which read the databases.
	for (const [, image] of rendered.matchAll(/image: (\S*(?:spiffe-helper|spire-server|spire-agent|spiffe-csi-driver|csi-node-driver-registrar|kube-state-metrics|node-exporter|mysqld-exporter|mongodb_exporter|redis_exporter):\S+)/g)) {
		if (!image.includes("@sha256:")) errors.push(`${env}: image ${image} is not pinned by digest`);
	}

	// SPIRE agents must not be newer than the server they talk to (upgrade guide): the node agents are applied before the server.
	const spireMinor = (name) => rendered.match(new RegExp(`image: \\S*${name}:(\\d+)\\.(\\d+)`))?.slice(1).map(Number);
	const [server, agent] = [spireMinor("spire-server"), spireMinor("spire-agent")];
	if (server && agent && (agent[0] > server[0] || (agent[0] === server[0] && agent[1] > server[1]))) {
		errors.push(`${env}: spire-agent ${agent.join(".")} is newer than spire-server ${server.join(".")} (agents move one release after the server)`);
	}

	for (const [dir, file, text] of [[`deploy/k8s/overlays/${env}`, "app-role.yaml", app], [`deploy/k8s/overlays/${env}/node-agents`, "node-role.yaml", nodeAgents]]) {
		for (const kind of uncoveredKinds(documents(text), file)) {
			errors.push(`${env}: ${kind} of ${dir} is not covered by deploy/k8s/deploy-identity/${file} (or cluster-role.yaml): the deploy identity could not apply it`);
		}
	}

	for (const name of unspreadDeployments(docs)) {
		errors.push(`${env}: Deployment ${name} can run several pods without topologySpreadConstraints on kubernetes.io/hostname (DoNotSchedule)`);
	}

	for (const name of unavailableSinglePods(docs)) {
		errors.push(`${env}: Deployment ${name} can run one pod but its rollingUpdate.maxUnavailable is not 0 (no ready pod during each rollout)`);
	}

	for (const name of replicasUnderHpa(docs)) {
		errors.push(`${env}: Deployment ${name} is driven by an HPA but sets spec.replicas (each apply would reset it)`);
	}

	for (const error of singletonViolations(documents(rendered))) errors.push(`${env}: ${error}`);

	// ADR-0064 §6: only the production overlay is the "production" deployment and may set live.
	const risk = docs.find((d) => d.kind === "ConfigMap" && d.name?.startsWith("risk-execution-config"))?.text ?? "";
	const riskValue = (key) => risk.match(new RegExp(`^ +${key}: "?([^"\n]+)"?$`, "m"))?.[1];
	if (riskValue("EXECUTION_MODE") === "live" && env !== "production") errors.push(`${env}: risk-execution-config sets EXECUTION_MODE=live outside production (ADR-0064 §6)`);
	if ((riskValue("DEPLOYMENT_ENV") === "production") !== (env === "production")) errors.push(`${env}: risk-execution-config DEPLOYMENT_ENV=${riskValue("DEPLOYMENT_ENV")}, only the production overlay may be production`);
	if (env !== "production" && /BROKER_API_(KEY|SECRET)/.test(rendered)) errors.push(`${env}: live broker keys outside the production overlay (ADR-0064 §6)`);
	// ADR-0064 §10 (issue #2879): one writer of the risk-execution volume, the rollout pause is accepted.
	const riskDeployment = docs.find((d) => d.kind === "Deployment" && d.name === "risk-execution")?.text ?? "";
	if (!/^ {4}type: Recreate$/m.test(riskDeployment) || !/^ {2}replicas: 1$/m.test(riskDeployment) || hpaTargets(docs).has("risk-execution")) {
		errors.push(`${env}: Deployment risk-execution must stay replicas: 1, strategy Recreate, no HPA: a second pod would write the same state (ADR-0064 §10)`);
	}

	// Issue #2821: replica-set members of production never share a node.
	for (const name of ["redis", "redis-sentinel", "mongo-audit"]) {
		const sts = docs.find((doc) => doc.kind === "StatefulSet" && doc.name === name);
		if (env === "production" && sts && !spreadsAcrossNodes(sts.text)) {
			errors.push(`production: StatefulSet ${name} lacks topologySpreadConstraints on kubernetes.io/hostname (DoNotSchedule)`);
		}
	}

	// Issue #809 (ADR-0062): production runs the alerting path twice, Alertmanager as one cluster.
	for (const name of ["alertmanager", "prometheus"]) {
		const sts = docs.find((doc) => doc.kind === "StatefulSet" && doc.name === name);
		const replicas = Number(sts?.text.match(/^ {2}replicas: (\d+)$/m)?.[1] ?? 1);
		const wanted = env === "production" ? 2 : 1;
		if (replicas !== wanted) errors.push(`${env}: StatefulSet ${name} must run ${wanted} replica(s), found ${replicas} (ADR-0062)`);
		if (replicas > 1 && sts && !spreadsAcrossNodes(sts.text)) {
			errors.push(`${env}: StatefulSet ${name} runs ${replicas} pods without topologySpreadConstraints on kubernetes.io/hostname (DoNotSchedule)`);
		}
		if (env === "production" && !docs.some((doc) => doc.kind === "PodDisruptionBudget" && doc.text.includes(`component: ${name}
`) && /^ {2}minAvailable: 1$/m.test(doc.text))) {
			errors.push(`production: no PodDisruptionBudget minAvailable: 1 for ${name} (ADR-0062)`);
		}
		if (name === "alertmanager" && sts && env === "production" && !/--cluster\.peer=alertmanager-headless:9094/.test(sts.text)) {
			errors.push("production: alertmanager has no --cluster.peer (ADR-0062)");
		}
		if (name === "prometheus" && sts && env === "production") {
			const config = docs.find((doc) => doc.kind === "ConfigMap" && doc.name?.startsWith("prometheus-config-"))?.text ?? "";
			const promImage = (text) => text.match(/image: (prom\/prometheus:\S+)/)?.[1];
			const composeImage = promImage(readFileSync("docker-compose.yml", "utf8"));
			if (promImage(sts.text) !== composeImage) errors.push(`production: prometheus image differs from docker-compose.yml (${composeImage}): the alert rules would be tested on another version (#1892)`);
			if (/\\n\s+--/.test(sts.text)) errors.push("prometheus: literal backslash-n inside the launch command (merges two flags on one line)");
			if (!/external_labels:\s+replica: '\$\{HOSTNAME\}'/.test(config)) errors.push("production: prometheus external label replica: '${HOSTNAME}' missing (ADR-0062)");
			if (!/alert_relabel_configs:\s+- action: labeldrop\s+regex: replica/.test(config)) errors.push("production: prometheus does not drop the replica label before sending alerts: both replicas' alerts would differ (ADR-0062)");
			if (!/alertmanager-ready/.test(config) || /alertmanager-headless/.test(config)) errors.push("production: prometheus must discover Alertmanager through the ready-only Service alertmanager-ready (ADR-0062)");
		}
	}

	for (const name of DATA_STATEFULSETS) {
		const sts = docs.find((doc) => doc.kind === "StatefulSet" && doc.name === name);
		if (!sts) {
			errors.push(`${env}: StatefulSet ${name} not found`);
			continue;
		}
		for (const [, cm] of sts.text.matchAll(/configMap:\n(?: +[^\n ][^\n]*\n)*? +name: (\S+)$/gm)) {
			if (!/-[245-9bcdfghkmt]{10}$/.test(cm) && !BARE_CONFIGMAPS.has(cm)) {
				errors.push(`${env}: StatefulSet ${name} mounts ConfigMap ${cm} by a bare name: generate it (configMapGenerator, hash suffix) so a restarted pod keeps its revision's config (issues #1456, #1460)`);
			}
		}
		const replicas = Number(sts.text.match(/^ {2}replicas: (\d+)$/m)?.[1] ?? 1);
		const partition = Number(sts.text.match(/^ {6}partition: (\d+)$/m)?.[1] ?? 0);
		if (env === "staging-local" && partition < replicas) {
			errors.push(`${env}: StatefulSet ${name} needs updateStrategy.rollingUpdate.partition >= replicas (${replicas}): a release would restart its pods`);
		}
		if (env !== "staging-local" && partition > 0) {
			errors.push(`${env}: StatefulSet ${name} must not set a partition: its pods would keep the old template`);
		}
	}

	// Issue #2378: default-deny-all cuts the local MinIO; only staging-local opens it, for backup and audit-logger.
	for (const component of ["backup", "audit-logger"]) {
		const opened = docs.some((doc) => doc.kind === "NetworkPolicy" && doc.text.includes(`app.kubernetes.io/component: ${component}
  policyTypes`) && doc.text.includes("cidr: 172.18.0.200/32"));
		if (opened !== (env === "staging-local")) {
			errors.push(`${env}: ${component} pods ${env === "staging-local" ? "need" : "must not have"} a NetworkPolicy egress to the local MinIO 172.18.0.200/32:9000 (issue #2378)`);
		}
	}

	// Issue #2197: every Mongo pod adds itself to the replica set.
	const auditBoot = docs.find((doc) => doc.kind === "StatefulSet" && doc.name === "mongo-audit")?.text.match(/^ +M="mongosh [\s\S]*?exec sleep infinity$/m)?.[0];
	if (!auditBoot?.includes("rs.add(process.env.SELF)")) {
		errors.push(`${env}: the mongodb-bootstrap script of mongo-audit must rs.add each member (issue #2197)`);
	}

	// Issue #917: a PDB demanding every pod of a fixed-replica workload blocks node drains.
	if (env === "production") {
		for (const pdb of docs.filter((doc) => doc.kind === "PodDisruptionBudget")) {
			const min = Number(pdb.text.match(/^ {2}minAvailable: (\d+)$/m)?.[1]);
			const component = pdb.text.match(/^ {6}app\.kubernetes\.io\/component: (\S+)$/m)?.[1];
			const workload = docs.find((doc) => ["Deployment", "StatefulSet"].includes(doc.kind) && doc.text.includes(`\n      app.kubernetes.io/component: ${component}\n`));
			const replicas = Number(workload?.text.match(/^ {2}replicas: (\d+)$/m)?.[1]);
			if (min >= replicas) errors.push(`production: PodDisruptionBudget ${pdb.name} requires ${min} of ${replicas} pod(s) of ${workload.name}: node drains would block`);
		}
		// ADR-0092: the exception to #917, a drain of these singletons is refused until forced.
		for (const name of ["mysql-pdb", "risk-execution-pdb"]) {
			const pdb = docs.find((doc) => doc.kind === "PodDisruptionBudget" && doc.name === name);
			if (!/^ {2}maxUnavailable: 0$/m.test(pdb?.text ?? "")) errors.push(`production: PodDisruptionBudget ${name} must keep maxUnavailable: 0 (ADR-0092)`);
		}
	}

	// Issue #1634: every major of PUBLIC_ROUTES needs an Ingress path to the edge-proxy.
	const majors = new Set(readFileSync("services/api-gateway/src/shared/public-routes.ts", "utf8").match(/"[A-Z]+ \/v\d+(?=\/)/g)?.map((route) => route.split("/")[1]));
	for (const major of majors) {
		if (!new RegExp(`^ +(?:- )?path: /${major}$`, "m").test(rendered)) errors.push(`${env}: PUBLIC_ROUTES serves /${major} but the api-gateway Ingress has no /${major} path`);
	}

	if (env.startsWith("staging")) {
		for (const pdb of docs.filter((doc) => doc.kind === "PodDisruptionBudget")) {
			if (/^ {2}(minAvailable: [1-9]|maxUnavailable: 0$)/m.test(pdb.text)) {
				errors.push(`staging: PodDisruptionBudget ${pdb.name} keeps minAvailable or maxUnavailable 0 (one replica: drains would block)`);
			}
		}
		if (!rendered.includes("nginx.ingress.kubernetes.io/whitelist-source-range")) {
			errors.push("staging: no ingress whitelist-source-range");
		}
	}

	// Issue #732: the rendered edge-proxy ConfigMap loads realip.inc from default.conf
	// and carries the overlay's own trusted CIDRs (not the base ones).
	const edge = docs.find((doc) => doc.kind === "ConfigMap" && doc.name?.startsWith("edge-proxy-nginx"));
	if (!edge?.text.includes("include /etc/nginx/conf.d/realip.inc;")) {
		errors.push(`${env}: edge-proxy-nginx does not include realip.inc in default.conf`);
	}
	// Issue #739: error lines carry the full "client: <IP>"; only `crit` may reach stderr (promtail -> Loki).
	if (!/^ *error_log \/dev\/stderr crit;$/m.test(edge?.text ?? "")) {
		errors.push(`${env}: edge-proxy-nginx default.conf lacks "error_log /dev/stderr crit;" (full client IP in error log)`);
	}
	const overlayCidrs = readFileSync(`deploy/k8s/overlays/${env}/realip.inc`, "utf8").match(/^set_real_ip_from .+;$/gm) ?? [];
	if (overlayCidrs.length === 0 || !overlayCidrs.every((line) => edge?.text.includes(line))) {
		errors.push(`${env}: edge-proxy-nginx realip.inc lacks the CIDRs of overlays/${env}/realip.inc`);
	}

	// Issue #740 (ADR-0063): per-person Grafana access, Viewer by default.
	const grafana = docs.find((doc) => doc.kind === "StatefulSet" && doc.name === "grafana")?.text ?? "";
	for (const [name, value] of [["GF_AUTH_ANONYMOUS_ENABLED", '"false"'], ["GF_USERS_ALLOW_SIGN_UP", '"false"'], ["GF_USERS_AUTO_ASSIGN_ORG_ROLE", "Viewer"]]) {
		if (!new RegExp(`- name: ${name}\\n\\s+value: ${value}$`, "m").test(grafana)) errors.push(`${env}: grafana must set ${name}=${value} (ADR-0063)`);
	}
	// OIDC off in every render (CI kind has no egress): each key an optional Secret key, never a literal.
	for (const name of ["ENABLED", "CLIENT_ID", "CLIENT_SECRET", "AUTH_URL", "TOKEN_URL", "API_URL", "ALLOWED_DOMAINS"].map((n) => `GF_AUTH_GENERIC_OAUTH_${n}`).concat("GF_SERVER_ROOT_URL")) {
		if (!new RegExp(`- name: ${name}\\n\\s+valueFrom:\\n\\s+secretKeyRef:\\n(?:\\s+(?:name|key): \\S+\\n)*?\\s+optional: true`).test(grafana)) errors.push(`${env}: grafana ${name} must come from an optional Secret key (ADR-0063)`);
	}

	// Same Secret key drives the OIDC switch and the hidden login form (issue #856); basic auth has its own optional key.
	for (const [name, key] of [["GF_AUTH_GENERIC_OAUTH_ENABLED", "GRAFANA_OIDC_ENABLED"], ["GF_AUTH_DISABLE_LOGIN_FORM", "GRAFANA_OIDC_ENABLED"], ["GF_AUTH_BASIC_ENABLED", "GRAFANA_BASIC_AUTH_ENABLED"]]) {
		if (!new RegExp(`- name: ${name}\\n\\s+valueFrom:\\n\\s+secretKeyRef:\\n(?:\\s+\\S+: \\S+\\n)*?\\s+key: ${key}\\n(?:\\s+\\S+: \\S+\\n)*?\\s+optional: true`).test(grafana)) errors.push(`${env}: grafana ${name} must read optional Secret key ${key} (issue #856)`);
	}

	for (const name of SEALED_ONLY) {
		if (docs.some((doc) => doc.kind === "Secret" && doc.name === name)) {
			errors.push(`${env}: Secret ${name} must come from a SealedSecret`);
		}
		if (!docs.some((doc) => doc.kind === "SealedSecret" && doc.name === name)) {
			errors.push(`${env}: no SealedSecret ${name}`);
		}
	}
	// staging-local is deployed as rendered: deploy.yml "Check sealed secrets" stops on any placeholder (issue #1065).
	const placeholders = [...rendered.matchAll(/^\s+(\S+): AgCHANGE_ME/gm)].map(([, key]) => key);
	if (env === "staging-local" && placeholders.length > 0) {
		errors.push(`${env}: placeholder AgCHANGE_ME for ${placeholders.join(", ")}: seal them (docs/deployment/STAGING_LOCAL.md)`);
	}
}

for (const error of [...new Set(errors)]) console.error(error);
if (errors.length > 0) process.exit(1);
console.log(`Overlays OK: ${OVERLAYS.join(", ")}`);
