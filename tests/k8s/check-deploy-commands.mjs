// Fails when a `kubectl` command the application deploy identity runs (deploy-k8s.sh,
// run-migrations.sh, the namespaced steps of deploy.yml) needs a verb/resource that
// deploy/k8s/deploy-identity/app-role.yaml does not grant (ADR-0041).
//   node tests/k8s/check-deploy-commands.mjs
// shortcut: heuristic parser (verb + first resource argument), commands without a
// visible resource (`apply -f -`) are covered by check-overlays.mjs; upgrade to a kind
// run with the deploy-app kubeconfig if it misses a case.
import { readFileSync } from "node:fs";

const ALIAS = { deployment: "deployments", deploy: "deployments", statefulset: "statefulsets", service: "services", svc: "services", secret: "secrets", configmap: "configmaps", pod: "pods", pods: "pods", hpa: "horizontalpodautoscalers", pdb: "poddisruptionbudgets", ingress: "ingresses", job: "jobs", cronjob: "cronjobs", endpointslice: "endpointslices" };
const norm = (r) => ALIAS[r] ?? r;

const rules = [...readFileSync("deploy/k8s/deploy-identity/app-role.yaml", "utf8").matchAll(/resources: \[([^\]]*)\]\n(?:\s+resourceNames: \[([^\]]*)\]\n)?\s+verbs: \[([^\]]*)\]/g)]
	.map(([, r, n, v]) => [r.split(",").map((x) => x.trim()), v.split(",").map((x) => x.trim()), n?.split(",").map((x) => x.trim())]);
// A rule limited by resourceNames only covers those names; a variable name (`"$s"`) is not checked.
const allowed = (res, verb, name) => rules.some(([r, v, n]) => r.includes(res) && v.includes(verb) && (!n || !name || name.includes("$") || n.includes(name)));

/** [resource, verb] pairs one kubectl segment needs. */
function needs(args) {
	const [verb, ...rest] = args;
	const pos = rest.filter((a) => !a.startsWith("-"));
	const type = (a) => norm((a ?? "").replace(/"/g, "").split("/")[0].split(",")[0]);
	switch (verb) {
		case "get": {
			if (!type(pos[0])) return [];
			// `get secret NAME` needs `get` on that name only; a bare `get secrets` needs list.
			const name = pos[0].includes("/") ? pos[0].split("/")[1] : pos[1];
			return type(pos[0]) === "secrets" && name ? [["secrets", "get", name.replace(/"/g, "")]] : [[type(pos[0]), "get"], [type(pos[0]), "list"]];
		}
		case "delete": return pos[0] && !rest.includes("-f") ? [[type(pos[0]), "delete"]] : [];
		case "wait": return [[type(pos[0]), "get"], [type(pos[0]), "watch"]];
		case "logs": return [["pods", "get"], ["pods/log", "get"]];
		case "exec": return [["pods/exec", "create"]];
		case "scale": return [[type(pos[0]) + "/scale", "get"], [type(pos[0]) + "/scale", "update"]];
		case "annotate": case "set": return [[type(pos[verb === "set" ? 1 : 0]), "patch"]];
		case "create": return pos[0] === "token" ? [] : [[type(pos[0]), "create"]];
		case "rollout": return pos[0] === "undo" || pos[0] === "restart"
			? [["replicasets", "list"], [type(pos[1]), "patch"]]
			: [[type(pos[1]), "get"], [type(pos[1]), "watch"]];
		default: return [];
	}
}

const errors = [];
const SOURCES = [
	["deploy/k8s/scripts/deploy-k8s.sh", () => true],
	["deploy/k8s/scripts/run-migrations.sh", () => true],
	[".github/workflows/deploy.yml", (l) => /-n "\$NS"/.test(l) && !/KUBECONFIG=|CLUSTER_KUBECONFIG/.test(l)],
];
for (const [file, keep] of SOURCES) {
	const text = readFileSync(file, "utf8").replace(/\\r?\n/g, " ");
	for (const line of text.split(/\r?\n/)) {
		if (/^\s*#/.test(line) || !keep(line)) continue;
		for (const [, cmd] of line.matchAll(/\bkubectl\s+((?:(?!\||&&|;|>|\)).)+)/g)) {
			const args = cmd.trim().split(/\s+/).filter((a, i, all) => !(a === "-n" || all[i - 1] === "-n"));
			for (const [res, verb, name] of needs(args)) {
				if (!allowed(res, verb, name)) errors.push(`${file}: \`kubectl ${args.slice(0, 3).join(" ")}\` needs ${verb} ${res}${name ? ` ${name}` : ""}, missing from app-role.yaml`);
			}
		}
	}
}
for (const e of new Set(errors)) console.error(e);
if (errors.length) process.exit(1);
console.log("Deploy commands covered by app-role.yaml");
