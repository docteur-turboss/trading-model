// Static checks of the rendered overlays, for the environments CI never
// deploys (production) as much as for staging:
//   - every overlay renders
//   - every first-party image (ghcr.io/trading-model/<image>) is published by
//     release.yml and rewritten by deploy.yml (IMAGES): an image missing there
//     would stay on the logical name, which no registry serves; and every
//     deploy.yml IMAGES entry is built by release.yml; the release.yml sign
//     matrix holds exactly the deploy.yml IMAGES entries
//   - every overlay gets its application secrets from SealedSecrets only, never
//     from a plain Secret (issue #417)
//   - no PodDisruptionBudget of staging demands more pods than staging runs
//     (its drains would block)
//   - no Deployment driven by an HPA sets spec.replicas: every apply would reset
//     the pod count the HPA chose (issue #416)
//   - every Deployment that can run more than one pod (replicas or its HPA)
//     spreads them across nodes (ADR-0024): otherwise one node can hold every
//     replica and its loss takes the whole service down
//   - the deploy identities (ADR-0041) cover what the overlays apply: every
//     kind of the application overlay is in deploy-identity/app-role.yaml (or,
//     for the cluster-scope ones, cluster-role.yaml), every kind of the
//     node-agents overlay in node-role.yaml or cluster-role.yaml
// Usage: node tests/k8s/check-overlays.mjs   (needs kubectl)
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const OVERLAYS = ["staging", "production"];
const SEALED_ONLY = ["trading-model-secrets"];
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

/** Deployments that may run several pods without a hard spread across nodes. */
function unspreadDeployments(docs) {
	const maxReplicas = new Map();
	for (const doc of docs.filter((d) => d.kind === "HorizontalPodAutoscaler")) {
		const target = doc.text.match(/scaleTargetRef:\n(?: {4}.*\n)*? {4}name: (\S+)$/m)?.[1];
		const max = Number(doc.text.match(/^ {2}maxReplicas: (\d+)$/m)?.[1] ?? 1);
		if (target) maxReplicas.set(target, max);
	}
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
	Deployment: ["apps", "deployments"], StatefulSet: ["apps", "statefulsets"], DaemonSet: ["apps", "daemonsets"],
	CronJob: ["batch", "cronjobs"], Job: ["batch", "jobs"],
	Ingress: ["networking.k8s.io", "ingresses"], NetworkPolicy: ["networking.k8s.io", "networkpolicies"],
	PodDisruptionBudget: ["policy", "poddisruptionbudgets"],
	HorizontalPodAutoscaler: ["autoscaling", "horizontalpodautoscalers"],
	VerticalPodAutoscaler: ["autoscaling.k8s.io", "verticalpodautoscalers"],
	Role: ["rbac.authorization.k8s.io", "roles"], RoleBinding: ["rbac.authorization.k8s.io", "rolebindings"],
	ClusterRole: ["rbac.authorization.k8s.io", "clusterroles"],
	ClusterRoleBinding: ["rbac.authorization.k8s.io", "clusterrolebindings"],
	SealedSecret: ["bitnami.com", "sealedsecrets"], Namespace: ["", "namespaces"],
	CSIDriver: ["storage.k8s.io", "csidrivers"],
};

/** "group/resource" pairs of a flow-style rules file (deploy/k8s/deploy-identity). */
function grantedResources(file) {
	const granted = new Set();
	const text = readFileSync("deploy/k8s/deploy-identity/" + file, "utf8");
	for (const [, groups, resources] of text.matchAll(/apiGroups: \[([^\]]*)\]\n\s+(?:resourceNames: \[[^\]]*\]\n\s+)?resources: \[([^\]]*)\]/g)) {
		for (const g of groups.split(",")) {
			for (const r of resources.split(",")) granted.add(g.trim().replace(/"/g, "") + "/" + r.trim());
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
		if (!resource) missing.add(kind + " (unknown kind: add it to RESOURCES)");
		else if (!(CLUSTER_KINDS.has(kind) ? cluster : namespaced).has(group + "/" + resource)) missing.add(kind);
	}
	return [...missing];
}

/** Deployments driven by an HPA that still set spec.replicas. */
function replicasUnderHpa(docs) {
	const targets = new Set();
	for (const doc of docs.filter((d) => d.kind === "HorizontalPodAutoscaler")) {
		const target = doc.text.match(/scaleTargetRef:\n(?: {4}.*\n)*? {4}name: (\S+)$/m)?.[1];
		if (target) targets.add(target);
	}
	return docs
		.filter((doc) => doc.kind === "Deployment" && targets.has(doc.name))
		.filter((doc) => /^ {2}replicas: \d+$/m.test(doc.text))
		.map((doc) => doc.name);
}

function deployImages() {
	const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
	const block = workflow.match(/^ {2}IMAGES: >-\n((?: {4}.*\n)+)/m);
	if (!block) throw new Error("deploy.yml: env IMAGES not found");
	return new Set(block[1].trim().split(/\s+/));
}

function releaseImages() {
	const workflow = readFileSync(".github/workflows/release.yml", "utf8");
	const services = workflow.match(/^ {8}service:\n((?: {10}- .*\n)+)/m);
	if (!services) throw new Error("release.yml: service matrix not found");
	const names = services[1].match(/- (\S+)/g).map((item) => item.slice(2));
	for (const [, image] of workflow.matchAll(/^ {10}- image: (\S+)$/gm)) {
		names.push(image);
	}
	return new Set(names);
}

/** Images of the release.yml sign matrix (the only `image:` list at this indent). */
function signedImages() {
	const workflow = readFileSync(".github/workflows/release.yml", "utf8");
	const images = workflow.match(/^ {8}image:\n((?: {10}- .*\n)+)/m);
	if (!images) throw new Error("release.yml: sign image matrix not found");
	return new Set(images[1].match(/- (\S+)/g).map((item) => item.slice(2)));
}

const errors = [];
const deployed = deployImages();
const released = releaseImages();
const signed = signedImages();

// release.yml verify-images resolves deploy.yml IMAGES: one never built fails every release.
// deploy.yml also refuses any IMAGES digest without a release.yml signature (ADR-0041).
for (const image of deployed) {
	if (!released.has(image)) errors.push(`deploy.yml IMAGES: ${image} is not built by release.yml`);
	if (!signed.has(image)) errors.push(`deploy.yml IMAGES: ${image} is not signed by release.yml`);
}
for (const image of signed) {
	if (!deployed.has(image)) errors.push(`release.yml sign: ${image} is not in deploy.yml IMAGES`);
}

for (const env of OVERLAYS) {
	const rendered = [
		render(`deploy/k8s/overlays/${env}`),
		render(`deploy/k8s/overlays/${env}/node-agents`),
	].join("\n---\n");

	for (const [, image] of rendered.matchAll(IMAGE)) {
		if (!deployed.has(image)) {
			errors.push(`${env}: image ${image} is not in deploy.yml IMAGES`);
		}
		if (!released.has(image)) {
			errors.push(`${env}: image ${image} is not built by release.yml`);
		}
	}

	// Issue #433: the images that deliver mTLS identities are pinned by digest.
	for (const [, image] of rendered.matchAll(/image: (\S*(?:spiffe-helper|spire-server|spire-agent|spiffe-csi-driver|csi-node-driver-registrar):\S+)/g)) {
		if (!image.includes("@sha256:")) errors.push(`${env}: image ${image} is not pinned by digest`);
	}

	for (const [dir, file] of [[`deploy/k8s/overlays/${env}`, "app-role.yaml"], [`deploy/k8s/overlays/${env}/node-agents`, "node-role.yaml"]]) {
		for (const kind of uncoveredKinds(documents(render(dir)), file)) {
			errors.push(env + ": " + kind + " of " + dir + " is not covered by deploy/k8s/deploy-identity/" + file + " (or cluster-role.yaml): the deploy identity could not apply it");
		}
	}

	for (const name of unspreadDeployments(documents(rendered))) {
		errors.push(`${env}: Deployment ${name} can run several pods without topologySpreadConstraints on kubernetes.io/hostname (DoNotSchedule)`);
	}

	for (const name of replicasUnderHpa(documents(rendered))) {
		errors.push(`${env}: Deployment ${name} is driven by an HPA but sets spec.replicas (each apply would reset it)`);
	}

	if (env === "staging") {
		for (const pdb of documents(rendered).filter((doc) => doc.kind === "PodDisruptionBudget")) {
			if (/^ {2}minAvailable: [1-9]/m.test(pdb.text)) {
				errors.push(`staging: PodDisruptionBudget ${pdb.name} keeps minAvailable (one replica: drains would block)`);
			}
		}
		if (!rendered.includes("nginx.ingress.kubernetes.io/whitelist-source-range")) {
			errors.push("staging: no ingress whitelist-source-range");
		}
	}

	{
		const docs = documents(rendered);
		for (const name of SEALED_ONLY) {
			if (docs.some((doc) => doc.kind === "Secret" && doc.name === name)) {
				errors.push(`${env}: Secret ${name} must come from a SealedSecret`);
			}
			if (!docs.some((doc) => doc.kind === "SealedSecret" && doc.name === name)) {
				errors.push(`${env}: no SealedSecret ${name}`);
			}
		}
	}
}

for (const error of [...new Set(errors)]) console.error(error);
if (errors.length > 0) process.exit(1);
console.log(`Overlays OK: ${OVERLAYS.join(", ")}`);
