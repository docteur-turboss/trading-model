import https from "node:https";
import { URL } from "node:url";

import type { z } from "zod";

import type { TlsCredentials } from "../domain/tls-paths";
import { HttpClientTimeoutError } from "./http-client-errors";
import { collectResponseBody } from "./http-response";
import type { HttpMethod, HttpRequestOptions } from "./http-types";
import { buildRequestOptions } from "./http-utils";
import { RetryCircuitHandler } from "./retry-circuit-handler";

const DEFAULT_TIMEOUT_MS = 10_000;

export interface RequestContext<TResponse> {
	method: HttpMethod;
	urlStr: string;
	body?: unknown;
	options?: HttpRequestOptions;
	schema?: z.ZodType<TResponse>;
}

export interface ServiceRoute {
	hostname: string;
	serviceName?: string;
}

export class HttpRequestExecutor {
	private readonly _retryHandler = new RetryCircuitHandler();

	async execute<TResponse>(
		context: RequestContext<TResponse>,
		tls?: TlsCredentials
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

	async executeWithRetry<TResponse>(
		context: RequestContext<TResponse>,
		route: ServiceRoute,
		tls?: TlsCredentials
	): Promise<TResponse | undefined> {
		return this._retryHandler.executeWithRetry(
			context,
			(ctx, t) => this.execute(ctx, t),
			route,
			tls
		);
	}

	checkPreconditions(
		urlStr: string,
		options?: HttpRequestOptions
	): ServiceRoute {
		return this._retryHandler.checkPreconditions(urlStr, options);
	}

	shouldRetry(error: Error): boolean {
		return this._retryHandler.shouldRetry(error);
	}

	recordSuccess(hostname: string, serviceName: string | undefined): void {
		this._retryHandler.recordSuccess(hostname, serviceName);
	}

	recordFailure(
		hostname: string,
		serviceName: string | undefined,
		serviceInstanceCount?: number
	): void {
		this._retryHandler.recordFailure(
			hostname,
			serviceName,
			serviceInstanceCount
		);
	}
}
