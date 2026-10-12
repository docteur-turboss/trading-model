import {
	DurationMs,
	isAllowedProxyIP,
	parseCIDRList,
	type ServiceId,
} from "@trading-model/common/domain/primitives";
import {
	HTTP_STATUS,
	type HttpStatusCode,
} from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/http/adapters/inbound/catch-error";
import {
	HEALTH_STATUS_OK,
	sendResponse,
} from "@trading-model/http/adapters/inbound/response-exception";
import { logger } from "@trading-model/http/infrastructure/logger";
import { Router } from "express";
import { z } from "zod";
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
import { parseRequestPath } from "../../shared/path-parser";
import { ServiceResolver } from "../outbound/service-resolver";
import { AUTH_MIDDLEWARE } from "./auth";
import { DEFAULT_LIMITER } from "./rate-limiter";

const RESOLVER = new ServiceResolver(
	ENV.DISCOVERY_SERVICE_URL,
	ENV.CACHE_TTL_MS
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

	const cacheKey = `${req.method}:${req.path}`;
	const cached = tryServeFromCache(req.method, cacheKey, CACHE);
	if (cached) {
		return cached;
	}

	const response = await proxyAndCache(
		req,
		target,
		{ serviceName, majorVersion, cacheKey, path },
		CACHE
	);
	if (response.status >= HTTP_STATUS.SERVICE_UNAVAILABLE) {
		SERVICE_ERRORS_TOTAL.inc({ service: serviceName });
	}
	return response;
});

function pingHandler(
	_req: import("express").Request,
	res: import("express").Response
): void {
	res.json({ status: HEALTH_STATUS_OK });
}

const TELEMETRY_SCHEMA = z.discriminatedUnion("type", [
	z.object({
		type: z.literal("vital"),
		name: z.string(),
		value: z.number(),
		rating: z.string().optional(),
	}),
	z.object({
		type: z.literal("error"),
		name: z.string(),
		message: z.string().optional(),
		stack: z.string().optional(),
	}),
]);

function telemetryHandler(
	req: import("express").Request,
	res: import("express").Response
): void {
	const parsed = TELEMETRY_SCHEMA.safeParse(req.body);
	if (!parsed.success) {
		res.status(400).json({ error: "Invalid telemetry payload" });
		return;
	}
	logger.info("Frontend telemetry received", { context: parsed.data });
	res.status(204).end();
}

export function createRouter(): Router {
	const router = Router();
	router.get("/ping", pingHandler);
	router.get("/metrics", metricsHandler);
	router.use(AUTH_MIDDLEWARE);
	router.use(DEFAULT_LIMITER);
	router.post("/telemetry", telemetryHandler);
	router.use(catchAllRoute);
	return router;
}
