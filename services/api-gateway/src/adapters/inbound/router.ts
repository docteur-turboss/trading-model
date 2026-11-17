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
import type { ResolvedEndpoint } from "@trading-model/validation/wire/service-resolver.types";
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
import { matchPublicRoute } from "../../shared/public-routes";
import { forwardRequest } from "../outbound/proxy-handler";
import { AUTH_MIDDLEWARE, authOf } from "./auth";
import { DEFAULT_LIMITER } from "./rate-limiter";

/** Every service listens on HTTPS port 3000 behind its DNS name. */
const SERVICE_PORT = Port.of(3000);
const CACHE = new ResponseCache(DurationMs.of(ENV.CACHE_TTL_MS));
const ALLOWED_PROXY_RANGES = parseCIDRList(ENV.ALLOWED_PROXY_CIDRS);

/**
 * The service's DNS name (K8s Service, compose service) resolved to an IP, so
 * it can be checked against ALLOWED_PROXY_CIDRS; no registry (ADR-0072).
 */
async function _resolve(
	serviceName: ServiceId
): Promise<ResolvedEndpoint | null> {
	// biome-ignore lint/plugin: an unresolvable name is answered 503, not thrown
	try {
		const { address } = await lookup(
			String(normalizeServiceName(serviceName)),
			{ family: 4 }
		);
		return { host: IPAddress.of(address), port: SERVICE_PORT };
	} catch {
		return null;
	}
}

/** The query string ("" or "?a=1"): `req.path`, which routes are matched on, leaves it out. */
function _search(req: Request): string {
	const url = req.originalUrl ?? req.url;
	const index = url.indexOf("?");
	return index === -1 ? "" : url.slice(index);
}

const catchAllRoute = catchSync(async (req, res) => {
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

	const pattern = matchPublicRoute(req.method, majorVersion, serviceName, path);
	if (!pattern) {
		return sendResponse({ error: "Route not found" }, HTTP_STATUS.NOT_FOUND);
	}

	res.locals.routeLabel = pattern;

	const scope = requiredScope(req.method);
	if (!authOf(req).apiKeyScopes.includes(scope)) {
		return sendResponse(
			{ error: "Forbidden", reason: `API key lacks the ${scope} scope` },
			HTTP_STATUS.FORBIDDEN
		);
	}

	// Forwarded with the path and keyed in the cache: another query is another answer.
	// Read before the DNS lookup: a cached answer needs no resolution.
	const search = _search(req);
	const cacheKey = `${req.method}:${req.path}${search}`;
	const cached = tryServeFromCache(req.method, cacheKey, CACHE);
	if (cached) {
		return cached;
	}

	const target = await _resolve(serviceName);
	if (!target) {
		logger.warn("Service name does not resolve", {
			context: { serviceName, majorVersion },
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

	// shortcut: release N forwards without /v<n> so N-1 services answer; N+1 forwards `/v${majorVersion}${path}` (ADR-0072).
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
