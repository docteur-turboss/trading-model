import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/contracts/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { ServiceId } from "@trading-model/primitives/primitives";
import { HostPort } from "@trading-model/primitives/service-identity";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";
import {
	ACTIVE_REQUESTS,
	PROXY_REQUEST_DURATION_SECONDS,
} from "../infrastructure/config/metrics";
import type { ProxyDeps, ResponseCachePort } from "./ports";

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
	{ forward, cache }: ProxyDeps
): Promise<ResponseObject> {
	const start = performance.now();
	ACTIVE_REQUESTS.inc();
	try {
		const result = await forward({ req, target, path: ctx.path });
		const parsedBody = tryParseJson(result.body);
		tryCacheResponse(req, ctx, result, parsedBody, cache);
		PROXY_REQUEST_DURATION_SECONDS.observe(
			{ service: ctx.serviceName, status: String(result.status) },
			(performance.now() - start) / 1000
		);
		return sendResponse(parsedBody ?? result.body, result.status);
	} catch (err: unknown) {
		PROXY_REQUEST_DURATION_SECONDS.observe(
			{
				service: ctx.serviceName,
				status: String(HTTP_STATUS.SERVICE_UNAVAILABLE),
			},
			(performance.now() - start) / 1000
		);
		return buildProxyErrorResponse(err, ctx, target);
	} finally {
		ACTIVE_REQUESTS.dec();
	}
}

function tryCacheResponse(
	req: Request,
	ctx: ProxyContext,
	result: { status: number; body: string },
	parsed: unknown,
	cache: ResponseCachePort
): void {
	// A signed answer (DLQ) is for its signer only: cached, it would be served
	// to any caller of the same URL.
	const signed = req.headers[HTTP_HEADERS.X_SIGNATURE] !== undefined;
	if (
		req.method === "GET" &&
		result.status === HTTP_STATUS.OK &&
		parsed &&
		!signed
	) {
		cache.set(ctx.cacheKey, {
			data: parsed,
			status: result.status as HttpStatusCode,
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
	logger.error("Proxy error", {
		context: {
			serviceName: ctx.serviceName,
			majorVersion: ctx.majorVersion,
			target: HostPort.toAddress(target),
			error: message,
		},
	});
	// The cause stays in the log: returned to the client, connection errors
	// would map the internal network.
	return sendResponse({ error: "Service unavailable" }, 503 as HttpStatusCode);
}

function tryParseJson(raw: string): unknown | null {
	// biome-ignore lint/plugin: parse helper: null means not JSON
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

export function tryServeFromCache(
	method: string,
	cacheKey: string,
	cache: ResponseCachePort
): ResponseObject | null {
	if (method !== "GET") {
		return null;
	}
	const cached = cache.get(cacheKey);
	if (!cached) {
		return null;
	}
	return sendResponse(cached.data, cached.status);
}
