import type { EndpointResolver } from "@trading-model/address-manager/application/discovery/endpoint-resolver";
import { ServiceId } from "@trading-model/primitives/primitives";
import {
	type ReadinessCheck,
	svidReadinessCheck,
} from "@trading-model/server-utils/adapters/inbound/readiness";
import { createServiceServer } from "@trading-model/server-utils/adapters/inbound/service-server-factory";
import type { Application } from "express";
import { createRouter, RESOLVER } from "../adapters/inbound/router";
import { ENV } from "../infrastructure/config/env";
import { PUBLIC_ROUTES } from "../shared/public-routes";

const PUBLIC_SERVICES = [
	...new Set(PUBLIC_ROUTES.map((route) => route.split(" ")[1].split("/")[1])),
];
// A pod only has a last known target for what it resolved: warm the majors it serves.
const WARM_MAJORS = [1, 2];

function _mountGatewayRoutes(app: Application): void {
	app.use("/", createRouter());
}

/**
 * Sticky: ready once the registry has answered, and never unready after (a later
 * outage is served from the resolver's last-known targets). A gateway that never
 * reached it has none and would answer 404 (issue #1112, ADR-0045). Once reached it
 * resolves every public service, so a Redis restart right after the start finds a
 * last known target to serve (ADR-0071) instead of a cold cache.
 */
export function discoveryReachedOnceCheck(
	resolver: Pick<EndpointResolver, "findInstance" | "resolve">
): ReadinessCheck {
	let reached = false;
	return {
		name: "discovery",
		check: async () => {
			if (!reached) {
				// Any name: only "the registry answered" matters, not what it holds.
				await resolver.findInstance(ServiceId.of("message-manager"));
				reached = true;
				await Promise.allSettled(
					PUBLIC_SERVICES.flatMap((name) =>
						WARM_MAJORS.map((major) =>
							resolver.resolve(ServiceId.of(name), major)
						)
					)
				);
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
		readiness: [svidReadinessCheck(ENV), discoveryReachedOnceCheck(RESOLVER)],
	});
}
