import { logger } from "@trading-model/common/config/logger";
import {
	DurationMs,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	HEALTH_STATUS_OK,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import { Router } from "express";
import {
	proxyAndCache,
	tryServeFromCache,
} from "../../application/proxy-dispatcher";
import { ResponseCache } from "../../infrastructure/cache";
import { ENV } from "../../infrastructure/config/env";
import { parseRequestPath } from "../../shared/path-parser";
import { ServiceResolver } from "../outbound/service-resolver";
import { AUTH_MIDDLEWARE } from "./auth";
import { DEFAULT_LIMITER } from "./rate-limiter";

const RESOLVER = new ServiceResolver(
	ENV.DISCOVERY_SERVICE_URL,
	ENV.CACHE_TTL_MS
);
const CACHE = new ResponseCache(DurationMs.of(ENV.CACHE_TTL_MS));

function _validatePath(
	req: import("express").Request
):
	| ReturnType<typeof sendResponse>
	| { majorVersion: number; serviceName: ServiceId; path: string } {
	const parsed = parseRequestPath(req);
	if (!parsed) {
		return sendResponse(
			{ error: "Invalid route format. Expected /v{version}/{serviceName}/**" },
			400 as HttpStatusCode
		);
	}

	if (!parsed.valid) {
		return sendResponse(
			{ error: "Invalid version number" },
			400 as HttpStatusCode
		);
	}

	return parsed;
}

const catchAllRoute = catchSync(async (req) => {
	const parsed = _validatePath(req);
	if (typeof parsed === "object" && "status" in parsed) {
		return parsed;
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
			404 as HttpStatusCode
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

function pingHandler(
	_req: import("express").Request,
	res: import("express").Response
): void {
	res.json({ status: HEALTH_STATUS_OK });
}

export function createRouter(): Router {
	const router = Router();
	router.get("/ping", pingHandler);
	router.use(AUTH_MIDDLEWARE);
	router.use(DEFAULT_LIMITER);
	router.use(catchAllRoute);
	return router;
}
