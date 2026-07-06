import type { z } from "zod";

import type { TlsCredentials, TlsPaths } from "../domain/tls-paths";
import { isServiceCircuitOpen } from "./http-circuit-breaker";
import { HttpClientError, HttpClientTimeoutError } from "./http-client-errors";
import {
	HttpRequestExecutor,
	type RequestContext,
} from "./http-request-executor";
import { HttpTlsLoader } from "./http-tls-loader";
import type { HttpRequestOptions } from "./http-types";

export class HttpClient {
	private readonly _tlsLoader: HttpTlsLoader;
	private readonly _executor: HttpRequestExecutor;

	constructor(tlsConfig?: TlsCredentials) {
		this._tlsLoader = new HttpTlsLoader(tlsConfig);
		this._executor = new HttpRequestExecutor();
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

	private async _request<TResponse>(
		context: RequestContext<TResponse>
	): Promise<TResponse | undefined> {
		if (this._tlsLoader.hasTlsConfig) {
			await this._tlsLoader.ensureLoaded();
		}

		const route = this._executor.checkPreconditions(
			context.urlStr,
			context.options
		);

		return this._executor.executeWithRetry(context, route, {
			ca: this._tlsLoader.ca,
			cert: this._tlsLoader.cert,
			key: this._tlsLoader.key,
		});
	}
}

export { computeAdaptiveTimeout } from "./http-retry";
export { HttpClientError, HttpClientTimeoutError, isServiceCircuitOpen };
