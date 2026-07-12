import https from "node:https";
import { URL } from "node:url";

import type { z } from "zod";
import type { URLString } from "../domain/primitives";
import type { TlsPemBundle } from "../domain/tls-paths";
import { CircuitRecorder, type ServiceRoute } from "./circuit-recorder";
import { HttpClientTimeoutError } from "./http-client-errors";
import { collectResponseBody } from "./http-response";
import type { HttpMethod, HttpRequestOptions } from "./http-types";
import { buildRequestOptions } from "./http-utils";
import { RetryExecutor, shouldRetry } from "./retry-executor";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface RequestContext<TResponse> {
	method: HttpMethod;
	urlStr: URLString;
	body?: unknown;
	options?: HttpRequestOptions;
	schema?: z.ZodType<TResponse>;
}

export type { ServiceRoute };

export class HttpRequestExecutor {
	private readonly _executor: RetryExecutor;
	private readonly _circuitRecorder = new CircuitRecorder();

	constructor() {
		this._executor = new RetryExecutor(this._circuitRecorder);
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

			if (context.body) {
				req.write(JSON.stringify(context.body));
			}

			req.end();
		});
	}

	executeWithRetry<TResponse>(
		context: RequestContext<TResponse>,
		route: ServiceRoute,
		tls?: Partial<TlsPemBundle>
	): Promise<TResponse | undefined> {
		return this._executor.executeWithRetry(
			context,
			(ctx, tls) => this.execute(ctx, tls),
			route,
			tls
		);
	}

	checkPreconditions(
		urlStr: URLString,
		options?: HttpRequestOptions
	): ServiceRoute {
		return this._circuitRecorder.checkPreconditions(urlStr, options);
	}

	shouldRetry(error: Error): boolean {
		return shouldRetry(error);
	}

	recordSuccess(route: ServiceRoute): void {
		this._circuitRecorder.recordSuccess(route);
	}

	recordFailure(route: ServiceRoute, serviceInstanceCount?: number): void {
		this._circuitRecorder.recordFailure(route, serviceInstanceCount);
	}
}
