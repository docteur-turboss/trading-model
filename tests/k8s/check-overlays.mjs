// Static checks of the rendered overlays, for the environments CI never
// deploys (production) as much as for staging:
//   - every overlay renders
//   - every first-party image (ghcr.io/trading-model/<image>) is published by
//     release.yml and rewritten by deploy.yml (IMAGES): an image missing there
//     would stay on the logical name, which no registry serves; and every
//     deploy.yml IMAGES entry is built by release.yml
//   - production gets its application secrets from SealedSecrets only, never
//     from a plain Secret (the staging secretGenerator holds dev- values)
//   - every Deployment that can run more than one pod (replicas or its HPA)
//     spreads them across nodes (ADR-0024): otherwise one node can hold every
//     replica and its loss takes the whole service down
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

const errors = [];
const deployed = deployImages();
const released = releaseImages();

// release.yml verify-images resolves deploy.yml IMAGES: one never built fails every release.
for (const image of deployed) {
	if (!released.has(image)) errors.push(`deploy.yml IMAGES: ${image} is not built by release.yml`);
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

	for (const name of unspreadDeployments(documents(rendered))) {
		errors.push(`${env}: Deployment ${name} can run several pods without topologySpreadConstraints on kubernetes.io/hostname (DoNotSchedule)`);
	}

	if (env === "production") {
		const docs = documents(rendered);
		for (const name of SEALED_ONLY) {
			if (docs.some((doc) => doc.kind === "Secret" && doc.name === name)) {
				errors.push(`production: Secret ${name} must come from a SealedSecret`);
			}
			if (!docs.some((doc) => doc.kind === "SealedSecret" && doc.name === name)) {
				errors.push(`production: no SealedSecret ${name}`);
			}
		}
	}
}

for (const error of [...new Set(errors)]) console.error(error);
if (errors.length > 0) process.exit(1);
console.log(`Overlays OK: ${OVERLAYS.join(", ")}`);
