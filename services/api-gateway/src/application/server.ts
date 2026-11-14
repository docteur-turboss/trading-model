import { EndpointResolver } from "@trading-model/address-manager/application/discovery/endpoint-resolver";
import { ServiceId } from "@trading-model/primitives/primitives";
import {
	type ReadinessCheck,
	svidReadinessCheck,
} from "@trading-model/server-utils/adapters/inbound/readiness";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";
import { createRouter } from "../adapters/inbound/router";
import { discoveryClient } from "../config/container";
import { ENV } from "../infrastructure/config/env";

function _mountGatewayRoutes(app: Application): void {
	app.use("/", createRouter());
}

/**
 * Sticky: ready once the registry has answered, and never unready after (a later
 * outage is served from the resolver's last-known targets). A gateway that never
 * reached it has none and would answer 404 (issue #1112, ADR-0045).
 */
export function discoveryReachedOnceCheck(
	resolver: Pick<EndpointResolver, "findInstance">
): ReadinessCheck {
	let reached = false;
	return {
		name: "discovery",
		check: async () => {
			if (!reached) {
				// Any name: only "the registry answered" matters, not what it holds.
				await resolver.findInstance(ServiceId.of("message-manager"));
				reached = true;
			}
			return true;
		},
	};
}

export function createServer() {
	return createServiceServer({
		env: ENV,
		serviceId: ServiceId.of("api-gateway"),
		routes: _mountGatewayRoutes,
		readiness: [
			svidReadinessCheck(ENV),
			discoveryReachedOnceCheck(
				new EndpointResolver(
					ENV.DISCOVERY_SERVICE_URL,
					ENV.CACHE_TTL_MS,
					discoveryClient
				)
			),
		],
	});
}
