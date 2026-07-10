import type { z } from "zod";

import type { TlsPaths, TlsPemBundle } from "../domain/tls-paths";
import type { URLString } from "../domain/primitives";
import { isServiceCircuitOpen } from "./http-circuit-breaker";
import { HttpClientError, HttpClientTimeoutError } from "./http-client-errors";
import {
	HttpRequestExecutor,
	type RequestContext,
} from "./http-request-executor";
import { loadTlsPemBundle } from "./http-tls-loader";
import type { HttpMethod, HttpRequestOptions } from "./http-types";

export class HttpClient {
	private readonly _tlsBundle: Partial<TlsPemBundle>;
	private readonly _executor: HttpRequestExecutor;

	constructor(tlsConfig?: Partial<TlsPemBundle>) {
		this._tlsBundle = loadTlsPemBundle(tlsConfig);
		this._executor = new HttpRequestExecutor();
	}

	async get<TResponse = void>(
		url: string,
		options?: HttpRequestOptions,
		schema?: z.ZodType<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "GET" as HttpMethod,
			urlStr: url as URLString,
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
			method: "POST" as HttpMethod,
			urlStr: url as URLString,
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
			method: "DELETE" as HttpMethod,
			urlStr: url as URLString,
			body,
			options,
			schema,
		});
	}

	static createWithTls(certPaths: TlsPaths): HttpClient {
		return new HttpClient({
			caPem: certPaths.caPath,
			certPem: certPaths.certPath,
			keyPem: certPaths.keyPath,
		});
	}

	private _request<TResponse>(
		context: RequestContext<TResponse>
	): Promise<TResponse | undefined> {
		const route = this._executor.checkPreconditions(
			context.urlStr,
			context.options
		);

		return this._executor.executeWithRetry(context, route, {
			caPem: this._tlsBundle.caPem,
			certPem: this._tlsBundle.certPem,
			keyPem: this._tlsBundle.keyPem,
		});
	}
}

export { computeAdaptiveTimeout } from "./http-retry";
export { HttpClientError, HttpClientTimeoutError, isServiceCircuitOpen };
