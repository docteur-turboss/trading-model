import fs from "node:fs";
import type { IncomingMessage } from "node:http";
import https from "node:https";
import { URL } from "node:url";
import { createGunzip, createInflate } from "node:zlib";

import type { z } from "zod";

import { normalizeError } from "../utils/errors";
import { sleep } from "../utils/sleep";
import {
	checkHostnameCircuit,
	checkServiceCircuit,
	isServiceCircuitOpen,
	recordHostnameFailure,
	recordHostnameSuccess,
	recordServiceFailure,
	recordServiceSuccess,
} from "./http-circuit-breaker";
import {
	HttpClientError,
	HttpClientTimeoutError,
} from "./http-client-errors";

/**
 * Reads a TLS file (key, cert, or CA) from disk.
 * Throws a typed HttpClientError if the file is missing or unreadable.
 */
async function readTlsFile(filePath: string, label: string): Promise<string> {
	try {
		await fs.promises.access(filePath, fs.constants.R_OK);
		return await fs.promises.readFile(filePath, "utf8");
	} catch (err) {
		const original = normalizeError(err);
		original.message = `Failed to read TLS ${label} from "${filePath}": ${original.message}`;
		throw original;
	}
}

/** Default number of retry attempts for transient failures. */
const DEFAULT_RETRY_COUNT = 3;

/** Base delay (ms) for exponential backoff between retries. */
const RETRY_BASE_DELAY_MS = 200;

/** Max delay (ms) cap for retry backoff. */
const RETRY_MAX_DELAY_MS = 5_000;

/**
 * Returns true for HTTP status codes considered safe to retry (5xx and 429).
 */
function isRetryableStatus(code: number): boolean {
	return code >= 500 || code === 429;
}

function computeRetryDelay(attempt: number): number {
	return Math.min(RETRY_BASE_DELAY_MS * 2 ** attempt, RETRY_MAX_DELAY_MS);
}

function decompressResponse(res: IncomingMessage): NodeJS.ReadableStream {
	const contentEncoding = (res.headers["content-encoding"] as string) || "";
	if (contentEncoding.includes("gzip")) {
		return res.pipe(createGunzip());
	}
	if (contentEncoding.includes("deflate")) {
		return res.pipe(createInflate());
	}
	return res;
}

function parseResponseBody<TResponse>(
	data: string,
	contentType: string,
	schema?: z.ZodType<TResponse>
): TResponse {
	if (contentType.startsWith("application/json")) {
		const parsed: unknown = JSON.parse(data);
		return schema ? schema.parse(parsed) : (parsed as TResponse);
	}
	const parsed: unknown = data;
	return schema ? schema.parse(parsed) : (parsed as TResponse);
}

interface ResponseCollectionContext<TResponse> {
	res: IncomingMessage;
	method: string;
	urlStr: string;
	schema?: z.ZodType<TResponse>;
}

function collectResponseBody<TResponse>(
	context: ResponseCollectionContext<TResponse>
): Promise<TResponse | undefined> {
	const { res, method, urlStr, schema } = context;
	return new Promise<TResponse | undefined>((resolve, reject) => {
		let data = "";
		const stream = decompressResponse(res);

		stream.on("data", (chunk: string) => {
			data += chunk;
		});
		stream.on("end", () => {
			if (res.statusCode && (res.statusCode < 200 || res.statusCode >= 300)) {
				return reject(
					new HttpClientError(
						`HTTP ${res.statusCode} on ${method} ${urlStr}`,
						res.statusCode
					)
				);
			}

			if (res.statusCode === 204) {
				return resolve(undefined);
			}

			try {
				const contentType = res.headers["content-type"] || "";
				resolve(parseResponseBody(data, contentType, schema));
			} catch (err) {
				reject(err instanceof Error ? err : new Error(String(err)));
			}
		});
	});
}

function buildRequestOptions(
	method: HttpMethod,
	url: URL,
	options: HttpRequestOptions & { cert?: string; key?: string; ca?: string }
): https.RequestOptions {
	return {
		method,
		hostname: url.hostname,
		port: url.port || 443,
		path: url.pathname + url.search,
		headers: {
			"Content-Type": "application/json",
			"Accept-Encoding": "gzip, deflate",
			...(options?.headers ?? {}),
		},
		cert: options.cert,
		key: options.key,
		ca: options.ca,
		rejectUnauthorized: true,
		agent: options?.agent ?? getKeepAliveAgent(),
	};
}

/** Shared keep-alive agent reused across all HttpClient instances. */
let sharedAgent: https.Agent | null = null;

/**
 * Returns a shared keep-alive HTTPS agent reused across all HttpClient instances.
 * Created lazily on first access (singleton pattern).
 */
function getKeepAliveAgent(): https.Agent {
	if (!sharedAgent) {
		sharedAgent = new https.Agent({
			keepAlive: true,
			keepAliveMsecs: 30_000,
			maxSockets: 64,
			maxFreeSockets: 16,
			scheduling: "lifo",
		});
	}
	return sharedAgent;
}

interface RequestContext<TResponse> {
	method: HttpMethod;
	urlStr: string;
	body?: unknown;
	options?: HttpRequestOptions;
	schema?: z.ZodType<TResponse>;
}

interface ExecuteRequestContext<TResponse> {
	method: HttpMethod;
	urlStr: string;
	body: unknown;
	schema: z.ZodType<TResponse> | undefined;
	options?: HttpRequestOptions;
}

/**
 * HttpClient
 *
 * Centralized abstraction for all outgoing HTTP calls within the module.
 */
export class HttpClient {
	private _ca?: string;
	private _cert?: string;
	private _key?: string;
	private _tlsLoaded = false;
	private readonly _tlsPaths?: { ca?: string; cert?: string; key?: string };
	private _tlsLoadPromise: Promise<void> | null = null;

	/**
	 * @param tlsConfig - Optional paths to TLS certificate files (loaded lazily on first request).
	 */
	constructor(tlsConfig?: { ca?: string; cert?: string; key?: string }) {
		this._tlsPaths = tlsConfig;
	}

	/**
	 * Ensures TLS certificates are loaded from disk before the first request.
	 * Uses a memoized promise to avoid concurrent reads — subsequent calls
	 * return the same promise (lazy async singleton).
	 */
	private async _ensureTlsLoaded(): Promise<void> {
		if (this._tlsLoaded || !this._tlsPaths) {
			return;
		}

		this._tlsLoadPromise ??= (async () => {
			if (!this._tlsPaths) {
				this._tlsLoaded = true;
				return;
			}
			const { ca, cert, key } = this._tlsPaths;
			if (ca) {
				this._ca = await readTlsFile(ca, "CA certificate");
			}
			if (cert) {
				this._cert = await readTlsFile(cert, "client certificate");
			}
			if (key) {
				this._key = await readTlsFile(key, "client key");
			}
			this._tlsLoaded = true;
		})();

		return await this._tlsLoadPromise;
	}

	/**
	 * Sends a GET request and returns the parsed response.
	 * Returns `undefined` for 204 No Content responses.
	 */
	async get<TResponse = void>(
		url: string,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "GET",
			urlStr: url,
			body: undefined,
			options,
			schema,
		});
	}

	/**
	 * Sends a POST request with an optional JSON body and returns the parsed response.
	 * Returns `undefined` for 204 No Content responses.
	 */
	async post<TResponse = void>(
		url: string,
		body?: unknown,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({ method: "POST", urlStr: url, body, options, schema });
	}

	/**
	 * Sends a DELETE request and returns the parsed response.
	 * Returns `undefined` for 204 No Content responses.
	 */
	async delete<TResponse = void>(
		url: string,
		body?: unknown,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({ method: "DELETE", urlStr: url, body, options, schema });
	}

	/**
	 * Creates an HttpClient configured with TLS certificates.
	 *
	 * Centralises the three-file mapping that was previously duplicated
	 * across address-manager, broker-message, and message-manager.
	 */
	static createWithTls(certPaths: TlsClientPaths): HttpClient {
		return new HttpClient({
			ca: certPaths.rootCACertPath,
			cert: certPaths.certificatePath,
			key: certPaths.keyCertificatePath,
		});
	}

	/**
	 * Core request dispatcher: checks circuit breakers, runs retry loop with
	 * exponential backoff, and records success/failure to update breaker state.
	 * Lazy-loads TLS certificates on first invocation if paths are configured.
	 */
	private _checkPreconditions(
		urlStr: string,
		options?: HttpRequestOptions
	): { hostname: string; serviceName: string | undefined } {
		const hostname = new URL(urlStr).hostname;
		const serviceName = options?.serviceName;
		checkHostnameCircuit(hostname);
		if (serviceName) {
			checkServiceCircuit(serviceName);
		}
		return { hostname, serviceName };
	}

	private async _request<TResponse>(
		context: RequestContext<TResponse>
	): Promise<TResponse | undefined> {
		const { method, urlStr, body, options, schema } = context;
		if (this._tlsPaths && !this._tlsLoaded) {
			await this._ensureTlsLoaded();
		}

		const retryCount = options?.retryCount ?? DEFAULT_RETRY_COUNT;

		const { hostname, serviceName } = this._checkPreconditions(urlStr, options);

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this._executeRequest<TResponse>({
					method,
					urlStr,
					body,
					schema,
					options,
				});
				this._recordSuccess(hostname, serviceName);
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryCount && this._shouldRetry(lastError)) {
					await sleep(computeRetryDelay(attempt));
					continue;
				}

				this._recordFailure(hostname, serviceName, options?.serviceInstanceCount);
				throw lastError;
			}
		}

		throw lastError ?? new Error("Request failed");
	}

	private _recordSuccess(
		hostname: string,
		serviceName: string | undefined
	): void {
		recordHostnameSuccess(hostname);
		if (serviceName) {
			recordServiceSuccess(serviceName);
		}
	}

	private _recordFailure(
		hostname: string,
		serviceName: string | undefined,
		serviceInstanceCount?: number
	): void {
		recordHostnameFailure(hostname);
		if (serviceName) {
			recordServiceFailure(serviceName, serviceInstanceCount);
		}
	}

	/**
	 * Returns true if the error is transient and the request should be retried.
	 * Retryable: timeout errors, 5xx / 429 status codes, connection resets / timeouts / refusals.
	 */
	private _shouldRetry(error: Error): boolean {
		if (error instanceof HttpClientTimeoutError) {
			return true;
		}
		if (
			error instanceof HttpClientError &&
			error.statusCode &&
			isRetryableStatus(error.statusCode)
		) {
			return true;
		}
		if (
			error.message.includes("ECONNRESET") ||
			error.message.includes("ETIMEDOUT") ||
			error.message.includes("ECONNREFUSED")
		) {
			return true;
		}
		return false;
	}

	/**
	 * Executes a single HTTPS request and returns the parsed response.
	 * Handles JSON and plain-text responses, gzip/deflate decompression,
	 * and Zod schema validation when a schema is provided.
	 */
	private _executeRequest<TResponse>(
		context: ExecuteRequestContext<TResponse>
	): Promise<TResponse | undefined> {
		const { method, urlStr, body, schema, options } = context;
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const url = new URL(urlStr);
		const requestOptions = buildRequestOptions(method, url, {
			...options,
			cert: this._cert,
			key: this._key,
			ca: this._ca,
		});

		return new Promise<TResponse | undefined>((resolve, reject) => {
			const req = https.request(requestOptions, (res) => {
				collectResponseBody({ res, method, urlStr, schema }).then(resolve, reject);
			});

			req.on("error", (err) => reject(err));

			const onTimeout = () => {
				req.destroy();
				reject(
					new HttpClientTimeoutError(
						`Request timed out after ${timeoutMs}ms`,
						timeoutMs
					)
				);
			};
			req.setTimeout(timeoutMs, onTimeout);
			req.on("close", () => {
				if (req.destroyed) {
					return;
				}
				req.removeListener("timeout", onTimeout);
			});

			if (body) {
				req.write(JSON.stringify(body));
			}

			req.end();
		});
	}
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Computes an adaptive timeout based on base timeout and observed EWMA latency.
 *
 * For cross-region calls where the one-way latency is known, this returns
 * max(baseMs, ewmLatencyMs × 3). For unknown regions, returns baseMs × 2.
 */
export function computeAdaptiveTimeout(
	baseMs: number,
	ewmLatencyMs?: number
): number {
	if (ewmLatencyMs !== undefined) {
		return Math.max(baseMs, Math.round(ewmLatencyMs * 3));
	}
	return baseMs * 2;
}

type HttpMethod = "GET" | "POST" | "DELETE";

/** Optional parameters for an HTTP request. */
export interface HttpRequestOptions {
	/** Timeout in milliseconds (default: 5000). */
	timeoutMs?: number;
	/** Custom HTTP headers. */
	headers?: Record<string, string>;
	/** Number of retry attempts for transient failures (default: 3). */
	retryCount?: number;
	/** Custom HTTPS agent (uses shared keep-alive agent by default). */
	agent?: https.Agent;
	/**
	 * Service name for the service-level circuit breaker.
	 * When provided, the service CB is checked before the request
	 * and updated on success/failure.
	 */
	serviceName?: string;
	/**
	 * Number of known instances for this service.
	 * Used to compute a dynamic CB threshold: max(2, instanceCount × 2).
	 * When omitted, the default static threshold (5) is used.
	 */
	serviceInstanceCount?: number;
}

/**
 * Standard TLS certificate paths used by all services.
 */
export interface TlsClientPaths {
	rootCACertPath: string;
	certificatePath: string;
	keyCertificatePath: string;
}

export { HttpClientError, HttpClientTimeoutError, isServiceCircuitOpen };
