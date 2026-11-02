import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";

/**
 * Services only accept SPIFFE mTLS clients (ADR-0011), so the host cannot call
 * them. In-mesh requests are sent from a service container with its SVID
 * (`meshRequest`); external traffic goes through the edge proxy, which
 * forwards /v1 to the gateway with its own SVID (`externalRequest`).
 */

export interface HttpResult {
	status: number;
	body: string;
}

export const e2eTestTimeout = 30000;

/** Containers whose SVID identifies the in-mesh caller (see DEFAULT_ACL). */
export const CALLER = {
	scraper: "trading-scraper",
	message: "trading-message",
	trainer: "trading-trainer",
} as const;

/** Every application container and its compose healthcheck. */
export const SERVICE_CONTAINERS = [
	"trading-discovery",
	"trading-message",
	"trading-scraper",
	"trading-trainer",
	"trading-gateway",
	"trading-audit",
	"trading-dlq",
	"trading-edge",
] as const;

/** Host entry point: edge proxy (the gateway is reached under /v1). */
export const EDGE_URL = `http://localhost:${process.env.EDGE_PORT ?? 8449}`;

/** API key the E2E overlay configures on the gateway (AUTH_TOKENS). */
export const GATEWAY_API_KEY = process.env.E2E_API_KEY ?? "e2e-api-key";

const SVID_ARGS = [
	"--cacert",
	"/run/spire/svid/bundle.pem",
	"--cert",
	"/run/spire/svid/svid.pem",
	"--key",
	"/run/spire/svid/svid_key.pem",
];
const STATUS_MARKER = "\n__HTTP_STATUS__:";

export interface MeshRequestOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
	/** Present no client certificate (only trust the bundle). */
	withoutCert?: boolean;
}

/** Sends an HTTPS request from `container`, authenticated by that container's SVID. */
export function meshRequest(
	container: string,
	url: string,
	options: MeshRequestOptions = {}
): HttpResult {
	const svid = options.withoutCert ? SVID_ARGS.slice(0, 2) : SVID_ARGS;
	const args = ["exec", "-i", container, "curl", "-s", ...svid];
	args.push(
		"-X",
		options.method ?? "GET",
		"-w",
		`${STATUS_MARKER}%{http_code}`
	);
	for (const [name, value] of Object.entries(options.headers ?? {})) {
		args.push("-H", `${name}: ${value}`);
	}
	if (options.body !== undefined) {
		args.push("-H", "Content-Type: application/json", "--data-binary", "@-");
	}
	args.push(url);
	let output: string;
	// A refused TLS handshake makes curl exit non-zero: keep what it printed.
	try {
		output = execFileSync("docker", args, {
			encoding: "utf8",
			input: options.body === undefined ? "" : JSON.stringify(options.body),
			stdio: ["pipe", "pipe", "pipe"],
		});
	} catch (error) {
		output = (error as { stdout?: string }).stdout ?? "";
	}
	const index = output.lastIndexOf(STATUS_MARKER);
	if (index < 0) {
		return { status: 0, body: output };
	}
	return {
		body: output.slice(0, index),
		status: Number(output.slice(index + STATUS_MARKER.length)),
	};
}

/** Sends a request from the host through the edge proxy. */
export async function externalRequest(
	path: string,
	options: MeshRequestOptions = {}
): Promise<HttpResult> {
	const res = await fetch(`${EDGE_URL}${path}`, {
		method: options.method ?? "GET",
		headers: {
			...(options.body === undefined
				? {}
				: { "Content-Type": "application/json" }),
			...options.headers,
		},
		body: options.body === undefined ? undefined : JSON.stringify(options.body),
	});
	return { status: res.status, body: await res.text() };
}

/** Docker health status of a container (`healthy`, `unhealthy`, `starting`). */
export function containerHealth(container: string): string {
	return execFileSync(
		"docker",
		["inspect", "--format", "{{.State.Health.Status}}", container],
		{ encoding: "utf8" }
	).trim();
}

/** Primary IPv4 of a container on the backend network. */
export function containerIp(container: string): string {
	return execFileSync(
		"docker",
		[
			"inspect",
			"--format",
			'{{(index .NetworkSettings.Networks "trading-backend-network").IPAddress}}',
			container,
		],
		{ encoding: "utf8" }
	).trim();
}

export interface DlqSignatureInput {
	serviceName: string;
	secret: string;
	body: unknown;
	timestamp: string;
	method: string;
	path: string;
}

function deterministicStringify(value: unknown): string {
	return JSON.stringify(value, (_key: string, val: unknown): unknown => {
		if (typeof val === "object" && val !== null) {
			if (val instanceof Date) {
				return val.toISOString();
			}
			if (!Array.isArray(val)) {
				const sorted: Record<string, unknown> = {};
				for (const key of Object.keys(val as object).sort()) {
					sorted[key] = (val as Record<string, unknown>)[key];
				}
				return sorted;
			}
		}
		return val;
	});
}

export function computeDlqSignature(input: DlqSignatureInput): string {
	const bodyHash = createHash("sha256")
		.update(deterministicStringify(input.body ?? {}))
		.digest("hex");
	const payload = `${input.serviceName}:${input.timestamp}:${bodyHash}:${input.method}:${input.path}`;
	return createHmac("sha256", input.secret).update(payload).digest("hex");
}
