import { logger } from "@trading-model/common/config/logger";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { Router, type Request } from "express";
import { ENV } from "../config/env";
import { AUTH_MIDDLEWARE } from "./auth";
import { ResponseCache } from "./cache";
import { forwardRequest } from "./proxy-handler";
import { DEFAULT_LIMITER } from "./rate-limiter";
import { ServiceResolver, type ResolvedTarget } from "./service-resolver";

const RESOLVER = new ServiceResolver(
	ENV.DISCOVERY_SERVICE_URL,
	ENV.CACHE_TTL_MS
);
const CACHE = new ResponseCache(ENV.CACHE_TTL_MS);

const VERSION_PATH_REGEX = /^\/v(\d+)\/([^/]+)(\/.*)?$/;

const catchAllRoute = catchSync(async (req) => {
	const parsed = _parseRequestPath(req);
	if (!parsed) {
		return sendResponse(
			{ error: "Invalid route format. Expected /v{version}/{serviceName}/**" },
			400
		);
	}
	if (!parsed.valid) {
		return sendResponse({ error: "Invalid version number" }, 400);
	}

	const { majorVersion, serviceName, path } = parsed;

	const target = await RESOLVER.resolve(serviceName, majorVersion);
	if (!target) {
		logger.warn("Service not found", { context: { serviceName, majorVersion } });
		return sendResponse(
			{
				error: "Service not found",
				service: serviceName,
				version: majorVersion,
			},
			404
		);
	}

	const cacheKey = `${req.method}:${req.path}`;
	const cached = _tryServeFromCache(req.method, cacheKey);
	if (cached) {
		return cached;
	}

	return _proxyAndCache(req, target, { serviceName, majorVersion, cacheKey, path });
});

interface ProxyContext {
	serviceName: string;
	majorVersion: number;
	cacheKey: string;
	path: string;
}

function _tryCacheResponse(req: Request, ctx: ProxyContext, result: { body: string; status: number }): void {
	if (req.method === "GET" && result.status === 200) {
		const parsed = tryParseJson(result.body);
		if (parsed) CACHE.set(ctx.cacheKey, { data: parsed, status: result.status });
	}
}

function _buildProxyErrorResponse(err: unknown, ctx: ProxyContext, target: ResolvedTarget): ResponseObject {
	const message = err instanceof Error ? err.message : "Unknown error";
	logger.error("Proxy error", { context: { serviceName: ctx.serviceName, majorVersion: ctx.majorVersion, target: `${target.host}:${target.port}`, error: message } });
	return sendResponse({ error: "Service unavailable", details: message }, 503);
}

async function _proxyAndCache(
	req: Request,
	target: ResolvedTarget,
	ctx: ProxyContext
): Promise<ResponseObject> {
	try {
		const result = await forwardRequest({ req, target, path: ctx.path });
		_tryCacheResponse(req, ctx, result);
		const parsedBody = tryParseJson(result.body);
		return sendResponse(parsedBody ?? result.body, result.status);
	} catch (err: unknown) {
		return _buildProxyErrorResponse(err, ctx, target);
	}
}

function _tryServeFromCache(
	method: string,
	cacheKey: string
): ResponseObject | null {
	if (method !== "GET") {
		return null;
	}
	const cached = CACHE.get(cacheKey);
	if (!cached) {
		return null;
	}
	return sendResponse(cached.data, cached.status);
}

type ParsedRequestPath =
	| { valid: false }
	| { valid: true; majorVersion: number; serviceName: string; path: string };

function _extractPathComponents(match: RegExpMatchArray): { majorVersion: number; serviceName: string; path: string } {
	return {
		majorVersion: Number.parseInt(match[1], 10),
		serviceName: match[2],
		path: match[3] ?? "/",
	};
}

function _parseRequestPath(req: {
	path: string;
	method: string;
}): ParsedRequestPath | null {
	const match = req.path.match(VERSION_PATH_REGEX);
	if (!match) return null;
	const { majorVersion, serviceName, path } = _extractPathComponents(match);
	if (Number.isNaN(majorVersion) || majorVersion < 1) return { valid: false };
	return { valid: true, majorVersion, serviceName, path };
}

export function createRouter(): Router {
	const router = Router();

	router.get("/ping", (_req, res) => {
		res.json({ status: "ok", service: "api-gateway" });
	});

	router.use(AUTH_MIDDLEWARE);
	router.use(DEFAULT_LIMITER);
	router.use(catchAllRoute);

	return router;
}

function tryParseJson(raw: string): unknown | null {
	try {
		return JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
}
