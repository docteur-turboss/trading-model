import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/contracts/http-status";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { ResolvedEndpoint } from "@trading-model/contracts/wire/service-resolver.types";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/response-exception";
import type { ServiceId } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { Request } from "express";
import {
	type ProxyDeps,
	ProxyOverloadedError,
	type ResponseCachePort,
	UpstreamResponseTooLargeError,
	UpstreamTimeoutError,
} from "../domain/ports/gateway.port";

interface ProxyContext {
	serviceName: ServiceId;
	majorVersion: number;
	cacheKey: string;
	path: string;
}

export async function proxyAndCache(
	req: Request,
	target: ResolvedEndpoint,
	ctx: ProxyContext,
	{ forward, cache, observeDuration }: ProxyDeps
): Promise<ResponseObject> {
	const start = performance.now();
	const response = await forwardOrError(req, target, ctx, forward, cache);
	observeDuration(
		{ service: ctx.serviceName, status: String(response.status) },
		(performance.now() - start) / 1000
	);
	return response;
}

async function forwardOrError(
	req: Request,
	target: ResolvedEndpoint,
	ctx: ProxyContext,
	forward: ProxyDeps["forward"],
	cache: ResponseCachePort
): Promise<ResponseObject> {
	try {
		const result = await forward({
			req,
			target,
			path: ctx.path,
			serviceName: ctx.serviceName,
		});
		const contentType = result.headers?.["content-type"];
		const type = typeof contentType === "string" ? contentType : undefined;
		tryCacheResponse(req, ctx, result, /json/i.test(type ?? ""), cache);
		// Relayed as received: no parse, no re-serialization.
		return { ...sendResponse(result.body, result.status), contentType: type };
	} catch (err: unknown) {
		const tooLarge = err instanceof UpstreamResponseTooLargeError;
		if (tooLarge) {
			getLogger().warn("Upstream response too large", {
				context: {
					serviceName: ctx.serviceName,
					path: ctx.path,
					maxBytes: err.maxBytes,
				},
			});
			return sendResponse(
				{ error: "Upstream response too large" },
				HTTP_STATUS.BAD_GATEWAY
			);
		}
		return buildProxyErrorResponse(err, ctx, target);
	}
}

function tryCacheResponse(
	req: Request,
	ctx: ProxyContext,
	result: { status: HttpStatusCode; body: string },
	isJson: boolean,
	cache: ResponseCachePort
): void {
	// A signed answer (DLQ) is for its signer only: cached, it would be served
	// to any caller of the same URL.
	const signed = req.headers[HTTP_HEADERS.X_SIGNATURE] !== undefined;
	if (
		req.method === "GET" &&
		result.status === HTTP_STATUS.OK &&
		isJson &&
		!signed
	) {
		cache.set(ctx.cacheKey, {
			data: result.body,
			status: result.status,
			bytes: result.body.length,
		});
	}
}

function buildProxyErrorResponse(
	err: unknown,
	ctx: ProxyContext,
	target: ResolvedEndpoint
): ResponseObject {
	const message = err instanceof Error ? err.message : "Unknown error";
	getLogger().error("Proxy error", {
		context: {
			serviceName: ctx.serviceName,
			majorVersion: ctx.majorVersion,
			target: HostPort.toAddress(target),
			error: message,
		},
	});
	// The cause stays in the log: returned to the client, connection errors
	// would map the internal network.
	if (err instanceof ProxyOverloadedError) {
		return {
			...sendResponse(
				{ error: "Gateway overloaded" },
				HTTP_STATUS.SERVICE_UNAVAILABLE
			),
			headers: { "Retry-After": "1" },
		};
	}
	if (err instanceof UpstreamTimeoutError) {
		return sendResponse(
			{ error: "Upstream timeout" },
			HTTP_STATUS.GATEWAY_TIMEOUT
		);
	}
	return sendResponse(
		{ error: "Service unavailable" },
		HTTP_STATUS.SERVICE_UNAVAILABLE
	);
}

export function tryServeFromCache(
	method: string,
	cacheKey: string,
	cache: ResponseCachePort,
	countLookup: (result: "hit" | "miss") => void
): ResponseObject | null {
	if (method !== "GET") {
		return null;
	}
	const cached = cache.get(cacheKey);
	countLookup(cached ? "hit" : "miss");
	if (!cached) {
		return null;
	}
	return sendResponse(cached.data, cached.status);
}
