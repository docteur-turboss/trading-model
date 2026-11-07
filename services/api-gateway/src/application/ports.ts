import type { HttpStatusCode } from "@trading-model/contracts/http-status";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";

/** Forwards a request to a resolved service and returns its raw answer. */
export type ForwardRequestPort = (opts: {
	req: Request;
	target: ResolvedEndpoint;
	path: string;
}) => Promise<{ status: number; body: string }>;

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
