import { ServiceId } from "@trading-model/common/domain/primitives";
import type { HttpStatusCode } from "@trading-model/common/http-status";
import type { ReadinessCheck } from "@trading-model/server-utils/adapters/inbound/readiness";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { HttpMethod } from "@trading-model/validation/domain/contracts/signed-request.types";
import type { ServiceRegistry } from "../domain/service-registry";
import { ENV } from "../infrastructure/config/env";
import {
	metricsHandler,
	trackRequest,
} from "../infrastructure/monitoring/metrics";
import { HEARTBEAT_ROUTES } from "../routes/heartbeat.routes";
import { REGISTRY_ROUTES } from "../routes/register.routes";

function _normalizePath(path: string): string {
	return path.replace(/\/\d+/g, "/:id");
}

function _createRequestMetricsMiddleware(): import("express").RequestHandler {
	return (req, res, next) => {
		const start = performance.now();
		res.on("finish", () => {
			trackRequest({
				method: req.method as HttpMethod,
				path: _normalizePath(req.path),
				status: res.statusCode as HttpStatusCode,
				durationMs: performance.now() - start,
			});
		});
		next();
	};
}

/** Create and return an HTTPS server with mounted registry and heartbeat routes. */
function _mountDiscoveryRoutes(
	app: import("express").Application,
	registry: ServiceRegistry
): void {
	app.use(_createRequestMetricsMiddleware());
	app.get("/metrics", metricsHandler);
	app.use("/", REGISTRY_ROUTES(registry));
	app.use("/", HEARTBEAT_ROUTES(registry));
}

export function createServer(
	registry: ServiceRegistry,
	options?: { readiness?: ReadinessCheck[] }
) {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("discovery-server"),
		routes: (app) => _mountDiscoveryRoutes(app, registry),
		readiness: options?.readiness,
	});
}
