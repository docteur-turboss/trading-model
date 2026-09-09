import { createHash, createHmac } from "node:crypto";
import http from "node:http";
import https from "node:https";

export interface FetchResult {
	status: number;
	body: string;
}

interface FetchOptions {
	method?: string;
	body?: unknown;
	headers?: Record<string, string>;
	timeout?: number;
}

function buildRequestOptions(options?: FetchOptions): http.RequestOptions {
	const bodyData = options?.body ? JSON.stringify(options.body) : undefined;
	return {
		method: options?.method || "GET",
		headers: {
			"Content-Type": "application/json",
			...options?.headers,
			...(bodyData
				? { "Content-Length": Buffer.byteLength(bodyData).toString() }
				: {}),
		},
		rejectUnauthorized: false,
		timeout: options?.timeout || 10000,
	};
}

function collectResponse(
	res: http.IncomingMessage,
	resolve: (result: FetchResult) => void
): void {
	let data = "";
	res.on("data", (chunk: string) => {
		data += chunk;
	});
	res.on("end", () => resolve({ status: res.statusCode ?? 0, body: data }));
}

function registerErrorHandlers(
	req: http.ClientRequest,
	reject: (reason?: unknown) => void,
	options?: FetchOptions
): void {
	req.on("error", (err: Error) => reject(err));
	req.on("timeout", () => {
		req.destroy();
		reject(new Error(`Request timeout after ${options?.timeout || 10000}ms`));
	});
}

export function fetchUrl(
	url: string,
	options?: FetchOptions
): Promise<FetchResult> {
	return new Promise((resolve, reject) => {
		const isHttps = url.startsWith("https");
		const lib = isHttps ? https : http;
		const bodyData = options?.body ? JSON.stringify(options.body) : undefined;

		const req = lib.request(url, buildRequestOptions(options), (res) => {
			collectResponse(res, resolve);
		});

		registerErrorHandlers(req, reject, options);

		if (bodyData) {
			req.write(bodyData);
		}
		req.end();
	});
}

export interface DlqSignatureInput {
	serviceName: string;
	secret: string;
	body: unknown;
	timestamp: string;
	method: string;
	path: string;
}

export function computeDlqSignature(input: DlqSignatureInput): string {
	const bodyHash = createHash("sha256")
		.update(JSON.stringify(input.body))
		.digest("hex");
	const payload = `${input.serviceName}:${input.timestamp}:${bodyHash}:${input.method}:${input.path}`;
	return createHmac("sha256", input.secret).update(payload).digest("hex");
}

export const PORTS = {
	discovery: 8443,
	message: 8444,
	scraper: 8445,
	trainer: 8446,
	ca: 8447,
	gateway: 8448,
	admin: 8449,
	audit: 8450,
	dlq: 8452,
} as const;

export const e2eTestTimeout = 30000;
