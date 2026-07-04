import fs from "node:fs";
import https from "node:https";
import { URL } from "node:url";
import { createGunzip, createInflate } from "node:zlib";

import type { z } from "zod";

import { normalizeError } from "../utils/errors";
import { sleep } from "../utils/sleep";

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

// ─── Circuit breaker (hostname-level) ────────────────────────────────────────

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerEntry {
	failures: number;
	state: CircuitState;
	lastFailureTime: number;
}

/** Consecutive failures before the circuit breaker opens. */
const CIRCUIT_BREAKER_THRESHOLD = 5;

/** Cooldown (ms) before transitioning from open to half-open. */
const CIRCUIT_COOLDOWN_MS = 30_000;

/** Per-hostname circuit breaker state. */
const HOSTNAME_CIRCUIT_BREAKERS = new Map<string, CircuitBreakerEntry>();

/**
 * Returns (or creates) the circuit breaker entry for a hostname.
 */
function getHostnameEntry(hostname: string): CircuitBreakerEntry {
	let entry = HOSTNAME_CIRCUIT_BREAKERS.get(hostname);
	if (!entry) {
		entry = { failures: 0, state: "closed", lastFailureTime: 0 };
		HOSTNAME_CIRCUIT_BREAKERS.set(hostname, entry);
	}
	return entry;
}

/**
 * Checks the circuit breaker for a hostname before sending a request.
 * Throws HttpClientError (503) if the circuit is open and cooldown has not elapsed.
 */
function checkHostnameCircuit(hostname: string): void {
	const entry = getHostnameEntry(hostname);
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= CIRCUIT_COOLDOWN_MS) {
			entry.state = "half-open";
			return;
		}
		throw new HttpClientError(`Circuit breaker open for ${hostname}`, 503);
	}
}

/**
 * Resets the hostname circuit breaker on a successful request.
 */
function recordHostnameSuccess(hostname: string): void {
	const entry = getHostnameEntry(hostname);
	entry.failures = 0;
	entry.state = "closed";
}

/**
 * Records a failure for the hostname and opens the circuit if threshold is reached.
 */
function recordHostnameFailure(hostname: string): void {
	const entry = getHostnameEntry(hostname);
	entry.failures++;
	entry.lastFailureTime = Date.now();
	if (entry.failures >= CIRCUIT_BREAKER_THRESHOLD) {
		entry.state = "open";
	}
}

// ─── Circuit breaker (service-level) ────────────────────────────────────────

interface ServiceCircuitBreakerEntry {
	failures: number;
	state: CircuitState;
	lastFailureTime: number;
}

/** Default threshold when instance count is unknown. */
const DEFAULT_SERVICE_CB_THRESHOLD = 5;

/** Cooldown (ms) for service-level circuit breaker. */
const SERVICE_CIRCUIT_COOLDOWN_MS = 30_000;

/** Per-service circuit breaker state, keyed by service name. */
const SERVICE_CIRCUIT_BREAKERS = new Map<string, ServiceCircuitBreakerEntry>();

/**
 * Returns (or creates) the circuit breaker entry for a service name.
 */
function getServiceEntry(serviceName: string): ServiceCircuitBreakerEntry {
	let entry = SERVICE_CIRCUIT_BREAKERS.get(serviceName);
	if (!entry) {
		entry = { failures: 0, state: "closed", lastFailureTime: 0 };
		SERVICE_CIRCUIT_BREAKERS.set(serviceName, entry);
	}
	return entry;
}

/**
 * Returns the effective failure threshold for a service based on instance count.
 * Threshold = max(2, instanceCount × 2) when instanceCount is known,
 * otherwise the default static threshold.
 */
function getServiceThreshold(instanceCount?: number): number {
	if (instanceCount !== undefined) {
		return Math.max(2, instanceCount * 2);
	}
	return DEFAULT_SERVICE_CB_THRESHOLD;
}

/**
 * Checks the circuit breaker for a service before sending a request.
 * Throws HttpClientError (503) if the circuit is open and cooldown has not elapsed.
 */
function checkServiceCircuit(serviceName: string): void {
	const entry = getServiceEntry(serviceName);
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= SERVICE_CIRCUIT_COOLDOWN_MS) {
			entry.state = "half-open";
			return;
		}
		throw new HttpClientError(
			`Circuit breaker open for service ${serviceName}`,
			503
		);
	}
}

/**
 * Resets the service circuit breaker on a successful request.
 */
function recordServiceSuccess(serviceName: string): void {
	const entry = getServiceEntry(serviceName);
	entry.failures = 0;
	entry.state = "closed";
}

/**
 * Records a failure for the service and opens the circuit if the dynamic threshold is reached.
 * The threshold is computed from the instance count: max(2, instanceCount × 2).
 */
function recordServiceFailure(
	serviceName: string,
	instanceCount?: number
): void {
	const entry = getServiceEntry(serviceName);
	entry.failures++;
	entry.lastFailureTime = Date.now();
	const threshold = getServiceThreshold(instanceCount);
	if (entry.failures >= threshold) {
		entry.state = "open";
	}
}

/**
 * Returns true if the service's circuit breaker is open (or half-open).
 * Side-effect: transitions 'open' → 'half-open' when the cooldown period
 * has elapsed, allowing a probe request through to test recovery.
 * Used by ServiceDiscovery to reject lookups early.
 */
export function isServiceCircuitOpen(serviceName: string): boolean {
	const entry = SERVICE_CIRCUIT_BREAKERS.get(serviceName);
	if (!entry || entry.state === "closed") {
		return false;
	}
	if (entry.state === "open") {
		if (Date.now() - entry.lastFailureTime >= SERVICE_CIRCUIT_COOLDOWN_MS) {
			entry.state = "half-open";
			return false;
		}
		return true;
	}
	// half-open — treat as open until a request succeeds
	return true;
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
		return await this._request<TResponse>(
			"GET",
			url,
			undefined,
			options,
			schema
		);
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
		return await this._request<TResponse>("POST", url, body, options, schema);
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
		return await this._request<TResponse>("DELETE", url, body, options, schema);
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
	private async _request<TResponse>(
		method: HttpMethod,
		urlStr: string,
		body?: unknown,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		if (this._tlsPaths && !this._tlsLoaded) {
			await this._ensureTlsLoaded();
		}

		const retryCount = options?.retryCount ?? DEFAULT_RETRY_COUNT;
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

		const hostname = new URL(urlStr).hostname;
		const serviceName = options?.serviceName;
		checkHostnameCircuit(hostname);
		if (serviceName) {
			checkServiceCircuit(serviceName);
		}

		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this._executeRequest<TResponse>(
					method,
					urlStr,
					body,
					schema,
					timeoutMs,
					options
				);
				recordHostnameSuccess(hostname);
				if (serviceName) {
					recordServiceSuccess(serviceName);
				}
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryCount && this._shouldRetry(lastError)) {
					const delay = Math.min(
						RETRY_BASE_DELAY_MS * 2 ** attempt,
						RETRY_MAX_DELAY_MS
					);
					await sleep(delay);
					continue;
				}

				recordHostnameFailure(hostname);
				if (serviceName) {
					recordServiceFailure(serviceName, options?.serviceInstanceCount);
				}
				throw lastError;
			}
		}

		throw lastError ?? new Error("Request failed");
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
		method: HttpMethod,
		urlStr: string,
		body: unknown,
		schema: z.ZodType<TResponse> | undefined,
		timeoutMs: number,
		options?: HttpRequestOptions
	): Promise<TResponse | undefined> {
		const url = new URL(urlStr);

		const requestOptions: https.RequestOptions = {
			method,
			hostname: url.hostname,
			port: url.port || 443,
			path: url.pathname + url.search,
			headers: {
				"Content-Type": "application/json",
				...(options?.headers ?? {}),
			},
			cert: this._cert,
			key: this._key,
			ca: this._ca,
			rejectUnauthorized: true,
			agent: options?.agent ?? getKeepAliveAgent(),
		};

		// Advertise compression support for cross-region bandwidth savings
		requestOptions.headers = {
			...requestOptions.headers,
			"Accept-Encoding": "gzip, deflate",
		};

		return new Promise<TResponse | undefined>((resolve, reject) => {
			const req = https.request(requestOptions, (res) => {
				let data = "";

				const contentEncoding =
					(res.headers["content-encoding"] as string) || "";

				const stream = contentEncoding.includes("gzip")
					? res.pipe(createGunzip())
					: contentEncoding.includes("deflate")
						? res.pipe(createInflate())
						: res;

				stream.on("data", (chunk) => {
					data += chunk;
				});
				stream.on("end", () => {
					if (
						res.statusCode &&
						(res.statusCode < 200 || res.statusCode >= 300)
					) {
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

					const contentType = res.headers["content-type"] || "";

					try {
						if (contentType.startsWith("application/json")) {
							const parsed: unknown = JSON.parse(data);
							resolve(schema ? schema.parse(parsed) : (parsed as TResponse));
						} else {
							const parsed: unknown = data;
							resolve(schema ? schema.parse(parsed) : (parsed as TResponse));
						}
					} catch (err) {
						reject(err instanceof Error ? err : new Error(String(err)));
					}
				});
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

/** Thrown when an HTTP response carries a non-2xx status code. */
export class HttpClientError extends Error {
	public readonly statusCode?: number;
	/**
	 * @param message - Human-readable error description.
	 * @param statusCode - The HTTP status code that caused the error.
	 */
	constructor(message: string, statusCode?: number) {
		super(message);
		this.name = "HttpClientError";
		this.statusCode = statusCode;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

/**
 * Standard TLS certificate paths used by all services.
 */
export interface TlsClientPaths {
	rootCACertPath: string;
	certificatePath: string;
	keyCertificatePath: string;
}

/** Thrown when an HTTP request exceeds the configured timeout. */
export class HttpClientTimeoutError extends Error {
	public readonly timeoutMs: number;
	/**
	 * @param message - Human-readable error description.
	 * @param timeoutMs - The timeout duration in milliseconds.
	 */
	constructor(message: string, timeoutMs: number) {
		super(message);
		this.name = "HttpClientTimeoutError";
		this.timeoutMs = timeoutMs;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}
