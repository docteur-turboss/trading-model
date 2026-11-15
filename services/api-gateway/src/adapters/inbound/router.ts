import { lookup } from "node:dns/promises";
import { normalizeServiceName } from "@trading-model/common/utils/spiffe";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import { catchSync } from "@trading-model/http/catch-error";
import { logger } from "@trading-model/http/logger";
import { sendResponse } from "@trading-model/http/response-exception";
import {
	DurationMs,
	IPAddress,
	isAllowedProxyIP,
	Port,
	parseCIDRList,
	type ServiceId,
} from "@trading-model/primitives/primitives";
import type { Request } from "express";
import { Router } from "express";
import {
	proxyAndCache,
	tryServeFromCache,
} from "../../application/proxy-dispatcher";
import { ResponseCache } from "../../infrastructure/cache";
import { ENV } from "../../infrastructure/config/env";
import {
	metricsHandler,
	SERVICE_ERRORS_TOTAL,
} from "../../infrastructure/config/metrics";
import { requiredScope } from "../../shared/api-keys";
import { parseRequestPath } from "../../shared/path-parser";
import { isPublicRoute } from "../../shared/public-routes";
import { forwardRequest } from "../outbound/proxy-handler";
import { AUTH_MIDDLEWARE, authOf } from "./auth";
import { DEFAULT_LIMITER } from "./rate-limiter";

/** Every service listens on 3000 behind its Service (K8s) or compose name. */
const SERVICE_PORT = Port.of(3000);
const CACHE = new ResponseCache(DurationMs.of(ENV.CACHE_TTL_MS));
const ALLOWED_PROXY_RANGES = parseCIDRList(ENV.ALLOWED_PROXY_CIDRS);

/**
 * The platform says where a service is (ADR-0072): its canonical name is its
 * DNS name, and kube-proxy / compose DNS only route to ready pods.
 */
async function _locate(serviceName: ServiceId) {
	const { address } = await lookup(String(normalizeServiceName(serviceName)), {
		family: 4,
	});
	return { host: IPAddress.of(address), port: SERVICE_PORT };
}

/** The query string ("" or "?a=1"): `req.path`, which routes are matched on, leaves it out. */
function _search(req: Request): string {
	const url = req.originalUrl ?? req.url;
	const index = url.indexOf("?");
	return index === -1 ? "" : url.slice(index);
}

const catchAllRoute = catchSync(async (req) => {
	const parsed = parseRequestPath(req);
	if (!parsed) {
		return sendResponse(
			{ error: "Invalid route format. Expected /v{version}/{serviceName}/**" },
			HTTP_STATUS.BAD_REQUEST
		);
	}
	if (!parsed.valid) {
		return sendResponse(
			{ error: "Invalid version number" },
			HTTP_STATUS.BAD_REQUEST
		);
	}

	const { majorVersion, serviceName, path } = parsed;

	if (!isPublicRoute(req.method, majorVersion, serviceName, path)) {
		return sendResponse({ error: "Route not found" }, HTTP_STATUS.NOT_FOUND);
	}

	const scope = requiredScope(req.method);
	if (!authOf(req).apiKeyScopes.includes(scope)) {
		return sendResponse(
			{ error: "Forbidden", reason: `API key lacks the ${scope} scope` },
			HTTP_STATUS.FORBIDDEN
		);
	}

	let target: Awaited<ReturnType<typeof _locate>>;
	try {
		target = await _locate(serviceName);
	} catch (error) {
		logger.warn("Service name does not resolve", {
			context: { serviceName, error: String(error) },
		});
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
		return sendResponse(
			{ error: "Service unavailable" },
			HTTP_STATUS.SERVICE_UNAVAILABLE
		);
	}

	if (ALLOWED_PROXY_RANGES.length === 0 && ENV.NODE_ENV === "production") {
		logger.error(
			"Proxy target IP validation disabled — ALLOWED_PROXY_CIDRS is empty in production"
		);
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
		return sendResponse(
			{ error: "Service unavailable — server misconfiguration" },
			HTTP_STATUS.SERVICE_UNAVAILABLE
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
			HTTP_STATUS.SERVICE_UNAVAILABLE
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
