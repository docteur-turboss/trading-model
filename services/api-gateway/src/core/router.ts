import { logger } from "@trading-model/common/config/logger";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import { Router } from "express";
import { ENV } from "../config/env";
import { AUTH_MIDDLEWARE } from "./auth";
import { ResponseCache } from "./cache";
import { parseRequestPath } from "./path-parser";
import { proxyAndCache, tryServeFromCache } from "./proxy-dispatcher";
import { DEFAULT_LIMITER } from "./rate-limiter";
import { ServiceResolver } from "./service-resolver";

const RESOLVER = new ServiceResolver(
	ENV.DISCOVERY_SERVICE_URL,
	ENV.CACHE_TTL_MS
);
const CACHE = new ResponseCache(ENV.CACHE_TTL_MS);

const catchAllRoute = catchSync(async (req) => {
	const parsed = parseRequestPath(req);
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
		logger.warn("Service not found", {
			context: { serviceName, majorVersion },
		});
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
	const cached = tryServeFromCache(req.method, cacheKey, CACHE);
	if (cached) {
		return cached;
	}

	return proxyAndCache(
		req,
		target,
		{ serviceName, majorVersion, cacheKey, path },
		CACHE
	);
});

export function createRouter(): Router {
	const router = Router();
	router.use(AUTH_MIDDLEWARE);
	router.use(DEFAULT_LIMITER);
	router.use(catchAllRoute);
	return router;
}
