import type {
	TlsPaths,
	TlsPemBundle,
} from "@trading-model/common/config/tls-paths";
import type { URLString } from "@trading-model/primitives/primitives";
import type { z } from "zod";
import type { HttpMethod, HttpRequestOptions } from "../../domain/http-types";
import {
	HttpRequestExecutor,
	type RequestContext,
} from "../../infrastructure/http-request-executor";
import { loadTlsPemBundleSync } from "../../infrastructure/http-tls-loader";

/**
 * A typed response needs its schema: the body is validated at this trust
 * boundary instead of being cast by every caller. Untyped calls get `void`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: matches the `void` default of the methods below
type SchemaArg<TResponse> = [TResponse] extends [void]
	? [schema?: z.ZodType<TResponse>]
	: [schema: z.ZodType<TResponse>];

export class HttpClient {
	private _tlsBundle: Partial<TlsPemBundle>;
	private readonly _executor: HttpRequestExecutor;
	private readonly _tlsPaths?: Partial<TlsPaths>;

	constructor(tlsConfig?: Partial<TlsPaths>) {
		this._tlsPaths = tlsConfig;
		this._tlsBundle = loadTlsPemBundleSync(tlsConfig);
		this._executor = new HttpRequestExecutor();
	}

	async get<TResponse = void>(
		url: URLString,
		options?: HttpRequestOptions,
		...[schema]: SchemaArg<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "GET" as HttpMethod,
			urlStr: url,
			body: undefined,
			options,
			schema,
		});
	}

	async post<TResponse = void>(
		url: URLString,
		body?: unknown,
		options?: HttpRequestOptions,
		...[schema]: SchemaArg<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "POST" as HttpMethod,
			urlStr: url,
			body,
			options,
			schema,
		});
	}

	async delete<TResponse = void>(
		url: URLString,
		body?: unknown,
		options?: HttpRequestOptions,
		...[schema]: SchemaArg<TResponse>
	): Promise<TResponse | undefined> {
		return await this._request<TResponse>({
			method: "DELETE" as HttpMethod,
			urlStr: url,
			body,
			options,
			schema,
		});
	}

	static createWithTls(certPaths: TlsPaths): HttpClient {
		return new HttpClient(certPaths);
	}

	private _request<TResponse>(
		context: RequestContext<TResponse>
	): Promise<TResponse | undefined> {
		const route = this._executor.checkPreconditions(
			context.urlStr,
			context.options
		);

		if (this._tlsPaths) {
			// Re-read key/cert/bundle on every request so SVID rotation (SPIFFE,
			// ADR-0011) is picked up as soon as spiffe-helper rewrites the files.
			this._tlsBundle = loadTlsPemBundleSync(this._tlsPaths);
		}

		return this._executor.executeWithRetry(context, route, {
			caPem: this._tlsBundle.caPem,
			certPem: this._tlsBundle.certPem,
			keyPem: this._tlsBundle.keyPem,
		});
	}
}
