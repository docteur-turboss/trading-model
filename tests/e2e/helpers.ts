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

/** Listed in DLQ_ALLOWED_SERVICES by the E2E overlay. */
const DLQ_SERVICE_NAME = "e2e-test-runner";
const DLQ_HMAC_SECRET = process.env.DLQ_AUTH_HMAC_SECRET ?? "test-hmac-secret";

/** HMAC headers dlq-service requires; `path` includes the query string. */
export function signedDlqHeaders(
	body: unknown,
	method: string,
	path: string,
	secret = DLQ_HMAC_SECRET
): Record<string, string> {
	const timestamp = Date.now().toString();
	const bodyHash = createHash("sha256")
		.update(deterministicStringify(body ?? {}))
		.digest("hex");
	const payload = `${DLQ_SERVICE_NAME}:${timestamp}:${bodyHash}:${method}:${path}`;
	return {
		"x-service-name": DLQ_SERVICE_NAME,
		"x-timestamp": timestamp,
		"x-signature": createHmac("sha256", secret).update(payload).digest("hex"),
	};
}

/** Runs one step of a journey; a failure is prefixed with the step name so it points at the faulty step. */
export async function step<T>(
	name: string,
	run: () => T | Promise<T>
): Promise<T> {
	try {
		return await run();
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new Error(`step "${name}" failed: ${message}`);
	}
}

/** Polls `probe` until it returns a value; a throwing probe counts as not ready yet. */
export async function eventually<T>(
	description: string,
	probe: () => T | undefined,
	{ timeoutMs = e2eTestTimeout, intervalMs = 1000 } = {}
): Promise<T> {
	const deadline = Date.now() + timeoutMs;
	let lastError: unknown;
	while (Date.now() < deadline) {
		try {
			const value = probe();
			if (value !== undefined) {
				return value;
			}
		} catch (error) {
			lastError = error;
		}
		await new Promise((resolve) => setTimeout(resolve, intervalMs));
	}
	throw new Error(
		`Timed out after ${timeoutMs}ms waiting for ${description}` +
			(lastError ? `: ${String(lastError)}` : "")
	);
}

/** Rows of `symbol` in MySQL `market_candles`. */
export function persistedCandles(symbol: string): number {
	const output = execFileSync(
		"docker",
		[
			"exec",
			"trading-mysql",
			"sh",
			"-c",
			`mysql -N -B -uroot -p"$MYSQL_ROOT_PASSWORD" "$MYSQL_DATABASE" -e "SELECT COUNT(*) FROM market_candles WHERE symbol='${symbol}'"`,
		],
		{ encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }
	);
	return Number(output.trim());
}

/** First capture of `pattern` in the metrics at `url` (read by the scraper), 0 if absent. */
export function metric(url: string, pattern: RegExp): number {
	const match = meshRequest(CALLER.scraper, url).body.match(pattern);
	return match ? Number(match[1]) : 0;
}
