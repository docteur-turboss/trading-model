import https from "node:https";
import { URL } from "node:url";

import type { z } from "zod";

import { sleep } from "../utils/sleep";
import {
	checkHostnameCircuit,
	checkServiceCircuit,
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

const DEFAULT_TIMEOUT_MS = 10_000;

export class HttpRequestExecutor {
	async execute<TResponse>(
		method: HttpMethod,
		urlStr: string,
		body: unknown,
		schema: z.ZodType<TResponse> | undefined,
		options: HttpRequestOptions | undefined,
		ca?: string,
		cert?: string,
		key?: string
	): Promise<TResponse | undefined> {
		const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const url = new URL(urlStr);
		const requestOptions = buildRequestOptions(method, url, {
			...options,
			cert,
			key,
			ca,
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

	async executeWithRetry<TResponse>(
		method: HttpMethod,
		urlStr: string,
		body: unknown,
		schema: z.ZodType<TResponse> | undefined,
		options: HttpRequestOptions | undefined,
		hostname: string,
		serviceName: string | undefined,
		ca?: string,
		cert?: string,
		key?: string
	): Promise<TResponse | undefined> {
		const retryCount = options?.retryCount ?? DEFAULT_RETRY_COUNT;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this.execute(
					method,
					urlStr,
					body,
					schema,
					options,
					ca,
					cert,
					key
				);
				this.recordSuccess(hostname, serviceName);
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryCount && this.shouldRetry(lastError)) {
					await sleep(computeRetryDelay(attempt));
					continue;
				}

				this.recordFailure(
					hostname,
					serviceName,
					options?.serviceInstanceCount
				);
				throw lastError;
			}
		}

		throw lastError ?? new Error("Request failed");
	}

	checkPreconditions(
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

	shouldRetry(error: Error): boolean {
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

	recordSuccess(hostname: string, serviceName: string | undefined): void {
		recordHostnameSuccess(hostname);
		if (serviceName) {
			recordServiceSuccess(serviceName);
		}
	}

	recordFailure(
		hostname: string,
		serviceName: string | undefined,
		serviceInstanceCount?: number
	): void {
		recordHostnameFailure(hostname);
		if (serviceName) {
			recordServiceFailure(serviceName, serviceInstanceCount);
		}
	}
}
