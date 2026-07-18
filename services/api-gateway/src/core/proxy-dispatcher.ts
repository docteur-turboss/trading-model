import { logger } from "@trading-model/common/config/logger";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import { HostPort } from "@trading-model/common/domain/service-identity";
import { HTTP_STATUS } from "@trading-model/common/http-status";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import type { ResolvedEndpoint } from "@trading-model/validation/contracts/service-resolver.types";
import type { Request } from "express";
import type { ResponseCache } from "./cache";
import { forwardRequest } from "./proxy-handler";

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
	try {
		const result = await forwardRequest({ req, target, path: ctx.path });
		tryCacheResponse(req, ctx, result, cache);
		const parsedBody = tryParseJson(result.body);
		return sendResponse(parsedBody ?? result.body, result.status);
	} catch (err: unknown) {
		return buildProxyErrorResponse(err, ctx, target);
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
			cache.set(ctx.cacheKey, { data: parsed, status: result.status });
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
	return sendResponse({ error: "Service unavailable", details: message }, 503);
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
