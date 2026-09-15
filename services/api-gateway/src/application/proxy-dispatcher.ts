import type { ServiceId } from "@trading-model/common/domain/primitives";
import { HostPort } from "@trading-model/common/domain/service-identity";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { ResolvedEndpoint } from "@trading-model/validation/adapters/outbound/service-resolver.types";
import type { Request } from "express";
import { forwardRequest } from "../adapters/outbound/proxy-handler";
import type { ResponseCache } from "../infrastructure/cache";
import {
	ACTIVE_REQUESTS,
	PROXY_REQUEST_DURATION_SECONDS,
} from "../infrastructure/config/metrics";

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
	cache: ResponseCache
): Promise<ResponseObject> {
	const start = performance.now();
	ACTIVE_REQUESTS.inc();
	try {
		const result = await forwardRequest({ req, target, path: ctx.path });
		tryCacheResponse(req, ctx, result, cache);
		const parsedBody = tryParseJson(result.body);
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
	result: { body: string; status: number },
	cache: ResponseCache
): void {
	if (req.method === "GET" && result.status === HTTP_STATUS.OK) {
		const parsed = tryParseJson(result.body);
		if (parsed) {
			cache.set(ctx.cacheKey, {
				data: parsed,
				status: result.status as HttpStatusCode,
			});
		}
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
	return sendResponse(
		{ error: "Service unavailable", details: message },
		503 as HttpStatusCode
	);
}

function tryParseJson(raw: string): unknown | null {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}

export function tryServeFromCache(
	method: string,
	cacheKey: string,
	cache: ResponseCache
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
