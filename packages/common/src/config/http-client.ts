import fs from "node:fs";
import https from "node:https";
import { URL } from "node:url";

import type { z } from "zod";

import type { TlsPaths } from "../domain/tls-paths";
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
import { HttpClientError, HttpClientTimeoutError } from "./http-client-errors";
import { DEFAULT_RETRY_COUNT, computeRetryDelay, isRetryableStatus } from "./http-retry";
import { collectResponseBody } from "./http-response";
import type { HttpMethod, HttpRequestOptions } from "./http-types";
import { buildRequestOptions } from "./http-utils";

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

const DEFAULT_TIMEOUT_MS = 10_000;

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

export class HttpClient {
	private _ca?: string;
	private _cert?: string;
	private _key?: string;
	private _tlsLoaded = false;
	private readonly _tlsPaths?: { ca?: string; cert?: string; key?: string };
	private _tlsLoadPromise: Promise<void> | null = null;

	constructor(tlsConfig?: { ca?: string; cert?: string; key?: string }) {
		this._tlsPaths = tlsConfig;
	}

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

	async post<TResponse = void>(
		url: string,
		body?: unknown,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "POST",
			urlStr: url,
			body,
			options,
			schema,
		});
	}

	async delete<TResponse = void>(
		url: string,
		body?: unknown,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "DELETE",
			urlStr: url,
			body,
			options,
			schema,
		});
	}

	static createWithTls(certPaths: TlsPaths): HttpClient {
		return new HttpClient({
			ca: certPaths.caPath,
			cert: certPaths.certPath,
			key: certPaths.keyPath,
		});
	}

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
		if (this._tlsPaths && !this._tlsLoaded) {
			await this._ensureTlsLoaded();
		}

		const { hostname, serviceName } = this._checkPreconditions(
			context.urlStr,
			context.options
		);

		return this._executeWithRetry(context, hostname, serviceName);
	}

	private async _executeWithRetry<TResponse>(
		context: RequestContext<TResponse>,
		hostname: string,
		serviceName: string | undefined
	): Promise<TResponse | undefined> {
		const retryCount = context.options?.retryCount ?? DEFAULT_RETRY_COUNT;
		const { method, urlStr, body, schema, options } = context;
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

				this._recordFailure(
					hostname,
					serviceName,
					options?.serviceInstanceCount
				);
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
				collectResponseBody({ res, method, urlStr, schema }).then(
					resolve,
					reject
				);
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

export { computeAdaptiveTimeout } from "./http-retry";
export { HttpClientError, HttpClientTimeoutError, isServiceCircuitOpen };
