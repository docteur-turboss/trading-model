import https from "node:https";
import { URL } from "node:url";

import type { z } from "zod";
import type { DurationMs, URLString } from "../domain/primitives";
import type { TlsPemBundle } from "../domain/tls-paths";
import { sleep } from "../utils/sleep";
import {
	type CircuitRecorder,
	getDefaultCircuitRecorder,
	type ServiceRoute,
} from "./circuit-recorder";
import { createHttpClientTimeoutError } from "./http-client-errors";
import { shouldRetry } from "./http-error-classifier";
import { collectResponseBody } from "./http-response";
import { computeRetryDelay, DEFAULT_RETRY_COUNT } from "./http-retry";
import type { HttpMethod, HttpRequestOptions } from "./http-types";
import { buildRequestOptions } from "./http-utils";

const DEFAULT_TIMEOUT_MS = 10_000 as DurationMs;

export interface RequestContext<TResponse> {
	method: HttpMethod;
	urlStr: URLString;
	body?: unknown;
	options?: HttpRequestOptions;
	schema?: z.ZodType<TResponse>;
}

export type { ServiceRoute };

export class HttpRequestExecutor {
	private readonly _circuitRecorder: CircuitRecorder;

	constructor(circuitRecorder?: CircuitRecorder) {
		this._circuitRecorder = circuitRecorder ?? getDefaultCircuitRecorder();
	}

	execute<TResponse>(
		context: RequestContext<TResponse>,
		tls?: Partial<TlsPemBundle>
	): Promise<TResponse | undefined> {
		const timeoutMs = context.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const url = new URL(context.urlStr);
		const requestOptions = buildRequestOptions(context.method, url, {
			...context.options,
			...tls,
		});
		return this._performRequest(context, requestOptions, timeoutMs);
	}

	private _performRequest<TResponse>(
		context: RequestContext<TResponse>,
		requestOptions: https.RequestOptions,
		timeoutMs: DurationMs
	): Promise<TResponse | undefined> {
		return new Promise<TResponse | undefined>((resolve, reject) => {
			const req = https.request(requestOptions, (res) => {
				collectResponseBody({
					res,
					method: context.method,
					urlStr: context.urlStr,
					schema: context.schema,
				}).then(resolve, reject);
			});

			req.on("error", (err) => reject(err));
			this._registerTimeout(req, reject, timeoutMs);

			if (context.body) {
				req.write(JSON.stringify(context.body));
			}

			req.end();
		});
	}

	private _registerTimeout(
		req: ReturnType<typeof https.request>,
		reject: (reason?: unknown) => void,
		timeoutMs: DurationMs
	): void {
		const onTimeout = () => {
			req.destroy();
			reject(
				createHttpClientTimeoutError(
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
	}

	async executeWithRetry<TResponse>(
		context: RequestContext<TResponse>,
		route: ServiceRoute,
		tls?: Partial<TlsPemBundle>
	): Promise<TResponse | undefined> {
		const retryCount = context.options?.retryCount ?? DEFAULT_RETRY_COUNT;
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this.execute(context, tls);
				this._circuitRecorder.recordSuccess(route);
				return result;
			} catch (error) {
				lastError = error instanceof Error ? error : new Error(String(error));

				if (attempt < retryCount && shouldRetry(lastError)) {
					await sleep(computeRetryDelay(attempt));
					continue;
				}

				this._circuitRecorder.recordFailure(
					route,
					context.options?.serviceInstanceCount
				);
				throw lastError;
			}
		}

		throw lastError ?? new Error("Request failed");
	}

	checkPreconditions(
		urlStr: URLString,
		options?: HttpRequestOptions
	): ServiceRoute {
		return this._circuitRecorder.checkPreconditions(urlStr, options);
	}

	recordSuccess(route: ServiceRoute): void {
		this._circuitRecorder.recordSuccess(route);
	}

	recordFailure(route: ServiceRoute, serviceInstanceCount?: number): void {
		this._circuitRecorder.recordFailure(route, serviceInstanceCount);
	}
}
