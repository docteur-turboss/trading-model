import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";

/** Forwards a request to a resolved service and returns its raw answer. */
export type ForwardRequestPort = (opts: {
	req: Request;
	target: ResolvedEndpoint;
	path: string;
}) => Promise<{ status: HttpStatusCode; body: string }>;

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
