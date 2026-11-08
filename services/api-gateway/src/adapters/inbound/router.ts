import { EndpointResolver } from "@trading-model/address-manager/application/discovery/endpoint-resolver";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import { sendResponse } from "@trading-model/http/adapters/inbound/response-exception";
import { logger } from "@trading-model/http/infrastructure/logger";
import {
	DurationMs,
	isAllowedProxyIP,
	parseCIDRList,
	type ServiceId,
} from "@trading-model/primitives/primitives";
import { Router } from "express";
import {
	proxyAndCache,
	tryServeFromCache,
} from "../../application/proxy-dispatcher";
import { discoveryClient } from "../../config/container";
import { ResponseCache } from "../../infrastructure/cache";
import { ENV } from "../../infrastructure/config/env";
import {
	metricsHandler,
	SERVICE_ERRORS_TOTAL,
} from "../../infrastructure/config/metrics";
import { parseRequestPath } from "../../shared/path-parser";
import { isPublicRoute } from "../../shared/public-routes";
import { forwardRequest } from "../outbound/proxy-handler";
import { AUTH_MIDDLEWARE } from "./auth";
import { DEFAULT_LIMITER } from "./rate-limiter";

const RESOLVER = new EndpointResolver(
	ENV.DISCOVERY_SERVICE_URL,
	ENV.CACHE_TTL_MS,
	discoveryClient
);
const CACHE = new ResponseCache(DurationMs.of(ENV.CACHE_TTL_MS));
const ALLOWED_PROXY_RANGES = parseCIDRList(ENV.ALLOWED_PROXY_CIDRS);

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

/** The query string ("" or "?a=1"): `req.path`, which routes are matched on, leaves it out. */
function _search(req: import("express").Request): string {
	const url = req.originalUrl ?? req.url;
	const index = url.indexOf("?");
	return index === -1 ? "" : url.slice(index);
}

const catchAllRoute = catchSync(async (req) => {
	const parsed = _validatePath(req);
	if (typeof parsed === "object" && "status" in parsed) {
		return parsed;
	}

	const { majorVersion, serviceName, path } = parsed;

	if (!isPublicRoute(req.method, serviceName, path)) {
		return sendResponse({ error: "Route not found" }, 404 as HttpStatusCode);
	}

	const target = await RESOLVER.resolve(serviceName, majorVersion);
	if (!target) {
		logger.warn("Service not found", {
			context: { serviceName, majorVersion },
		});
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
		return sendResponse(
			{
				error: "Service not found",
				service: serviceName,
				version: majorVersion,
			},
			404 as HttpStatusCode
		);
	}

	if (ALLOWED_PROXY_RANGES.length === 0 && ENV.NODE_ENV === "production") {
		logger.error(
			"Proxy target IP validation disabled — ALLOWED_PROXY_CIDRS is empty in production"
		);
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
		return sendResponse(
			{ error: "Service unavailable — server misconfiguration" },
			503 as HttpStatusCode
		);
	}

	if (
		ALLOWED_PROXY_RANGES.length > 0 &&
		!isAllowedProxyIP(target.host, ALLOWED_PROXY_RANGES)
	) {
		logger.warn("Proxy target IP not in allowed range", {
			context: { serviceName, host: target.host },
		});
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
		return sendResponse(
			{ error: "Service unavailable" },
			503 as HttpStatusCode
		);
	}

	// Forwarded with the path and keyed in the cache: another query is another answer.
	const search = _search(req);
	const cacheKey = `${req.method}:${req.path}${search}`;
	const cached = tryServeFromCache(req.method, cacheKey, CACHE);
	if (cached) {
		return cached;
	}

	const response = await proxyAndCache(
		req,
		target,
		{ serviceName, majorVersion, cacheKey, path: `${path}${search}` },
		{ forward: forwardRequest, cache: CACHE }
	);
	if (response.status >= HTTP_STATUS.SERVICE_UNAVAILABLE) {
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
	}
	return response;
});

export function createRouter(): Router {
	const router = Router();
	router.get("/metrics", metricsHandler);
	router.use(AUTH_MIDDLEWARE);
	router.use(DEFAULT_LIMITER);
	router.use(catchAllRoute);
	return router;
}
