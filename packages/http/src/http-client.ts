import https from "node:https";
import type {
	TlsPaths,
	TlsPemBundle,
} from "@trading-model/common/config/tls-paths";
import { sleep } from "@trading-model/common/utils/sleep";
import type {
	DurationMs,
	URLString,
} from "@trading-model/primitives/primitives";
import type { z } from "zod";
import {
	getDefaultCircuitRecorder,
	type ServiceRoute,
} from "./circuit-recorder";
import { createHttpClientTimeoutError } from "./http-client-errors";
import {
	isConnectionRefused,
	isTargetAnswer,
	shouldRetry,
} from "./http-error-classifier";
import { collectResponseBody } from "./http-response";
import { computeRetryDelay, DEFAULT_RETRY_COUNT } from "./http-retry";
import { loadTlsPemBundleSync } from "./http-tls-loader";
import type { HttpMethod, HttpRequestOptions } from "./http-types";
import { buildRequestOptions } from "./http-utils";
import { toJsonWire } from "./json-wire";
import {
	outboundRequestDurationSeconds,
	outboundRequestsInFlight,
	outboundRequestsTotal,
} from "./outbound-metrics";

const DEFAULT_TIMEOUT_MS = 10_000 as DurationMs;

/** Inputs of one outbound request: method, URL, options and response parser. */
interface RequestContext<TResponse> {
	method: HttpMethod;
	urlStr: URLString;
	body?: unknown;
	options?: HttpRequestOptions;
	schema?: z.ZodType<TResponse>;
}

/**
 * A typed response needs its schema: the body is validated at this trust
 * boundary instead of being cast by every caller. Untyped calls get `void`.
 */
// biome-ignore lint/suspicious/noConfusingVoidType: matches the `void` default of the methods below
type SchemaArg<TResponse> = [TResponse] extends [void]
	? [schema?: z.ZodType<TResponse>]
	: [schema: z.ZodType<TResponse>];

/** Outbound HTTP client: holds the TLS paths, retries and records each outcome in the circuit recorder. */
export class HttpClient {
	private readonly _circuitRecorder = getDefaultCircuitRecorder();
	private readonly _tlsPaths?: Partial<TlsPaths>;

	constructor(tlsConfig?: Partial<TlsPaths>) {
		this._tlsPaths = tlsConfig;
		// Read once now: a missing file fails at construction, not at the first call.
		loadTlsPemBundleSync(tlsConfig);
	}

	get<TResponse = void>(
		url: URLString,
		options?: HttpRequestOptions,
		...[schema]: SchemaArg<TResponse>
	): Promise<TResponse | undefined> {
		return this._request({
			method: "GET" as HttpMethod,
			urlStr: url,
			options,
			schema,
		});
	}

	post<TResponse = void>(
		url: URLString,
		body?: unknown,
		options?: HttpRequestOptions,
		...[schema]: SchemaArg<TResponse>
	): Promise<TResponse | undefined> {
		return this._request({
			method: "POST" as HttpMethod,
			urlStr: url,
			body,
			options,
			schema,
		});
	}

	delete<TResponse = void>(
		url: URLString,
		body?: unknown,
		options?: HttpRequestOptions,
		...[schema]: SchemaArg<TResponse>
	): Promise<TResponse | undefined> {
		return this._request({
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

	private async _request<TResponse>(
		context: RequestContext<TResponse>
	): Promise<TResponse | undefined> {
		const route = this._circuitRecorder.checkPreconditions(
			context.urlStr,
			context.options
		);
		// Re-read key/cert/bundle on every request so SVID rotation (SPIFFE,
		// ADR-0011) is picked up as soon as spiffe-helper rewrites the files.
		const tls = loadTlsPemBundleSync(this._tlsPaths);
		const retryCount = context.options?.retryCount ?? DEFAULT_RETRY_COUNT;

		for (let attempt = 0; attempt <= retryCount; attempt++) {
			try {
				const result = await this._send(context, tls);
				this._circuitRecorder.recordSuccess(route);
				return result;
			} catch (error) {
				const lastError =
					error instanceof Error ? error : new Error(String(error));
				if (context.options?.signal?.aborted) {
					throw lastError;
				}
				const idempotent =
					context.options?.idempotent ?? context.method !== "POST";
				const retryable = idempotent
					? shouldRetry(lastError)
					: isConnectionRefused(lastError);
				if (attempt < retryCount && retryable) {
					await sleep(computeRetryDelay(attempt));
					continue;
				}
				this._recordFailure(route, lastError);
				throw lastError;
			}
		}
		// Only reached with a negative retryCount: no attempt at all.
		throw new Error("Request failed");
	}

	/** A 4xx answer proves the target is up: only unavailability opens the circuit. */
	private _recordFailure(route: ServiceRoute, error: Error): void {
		if (isTargetAnswer(error)) {
			this._circuitRecorder.recordSuccess(route);
		} else {
			this._circuitRecorder.recordFailure(route);
		}
	}

	private _send<TResponse>(
		context: RequestContext<TResponse>,
		tls: Partial<TlsPemBundle>
	): Promise<TResponse | undefined> {
		const timeoutMs = context.options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		const requestOptions = {
			...buildRequestOptions(context.method, new URL(context.urlStr), {
				...context.options,
				...tls,
			}),
			signal: context.options?.signal,
		};
		const service = (requestOptions.hostname ?? "unknown").replace(
			/\.\w+$/,
			""
		);
		const method = context.method;

		outboundRequestsInFlight.inc({ service });
		const end = outboundRequestDurationSeconds.startTimer({ service, method });
		const done = (status: string) => {
			end();
			outboundRequestsTotal.inc({ service, method, status });
			outboundRequestsInFlight.dec({ service });
		};

		return new Promise<TResponse | undefined>((resolve, reject) => {
			const req = https.request(requestOptions, (res) => {
				done(String(res.statusCode ?? 0));
				collectResponseBody({
					res,
					method,
					urlStr: context.urlStr,
					schema: context.schema,
				}).then(resolve, reject);
			});

			req.on("error", (err) => {
				done("error");
				reject(err);
			});
			// Total deadline, not the socket idle timeout: a slow trickle must not defeat it.
			const timer = setTimeout(() => {
				req.destroy();
				reject(
					createHttpClientTimeoutError(
						`Request timed out after ${timeoutMs}ms`,
						timeoutMs
					)
				);
			}, timeoutMs);
			req.on("close", () => clearTimeout(timer));

			if (context.body) {
				req.write(JSON.stringify(context.body, toJsonWire));
			}
			req.end();
		});
	}
}
