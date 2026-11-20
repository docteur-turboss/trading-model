import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ResolvedEndpoint } from "@trading-model/validation/wire/service-resolver.types";
import type { Request } from "express";

/** Forwards a request to a resolved service and returns its raw answer. */
type ForwardRequestPort = (opts: {
	req: Request;
	target: ResolvedEndpoint;
	path: string;
	serviceName: string;
}) => Promise<{
	status: HttpStatusCode;
	body: string;
	headers?: Record<string, string | string[] | undefined>;
}>;

/**
 * The upstream answer passed PROXY_MAX_RESPONSE_BYTES: the forward port cut
 * it rather than hold it in memory (ADR-0054). The dispatcher answers 502.
 */
export class UpstreamResponseTooLargeError extends Error {
	constructor(readonly maxBytes: number) {
		super(`Upstream response larger than ${maxBytes} bytes`);
		this.name = "UpstreamResponseTooLargeError";
	}
}

/** The upstream did not finish answering within PROXY_TIMEOUT_MS: the dispatcher answers 504. */
export class UpstreamTimeoutError extends Error {
	constructor(readonly timeoutMs: number) {
		super(`Upstream did not answer within ${timeoutMs}ms`);
		this.name = "UpstreamTimeoutError";
	}
}

/** Short-lived cache of successful GET answers, keyed by method + path + query. */
export interface ResponseCachePort {
	get(key: string): { data: unknown; status: HttpStatusCode } | undefined;
	set(
		key: string,
		value: { data: unknown; status: HttpStatusCode; bytes?: number }
	): void;
}

export interface ProxyDeps {
	forward: ForwardRequestPort;
	cache: ResponseCachePort;
}
