import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { ServiceRegistry } from "../../../domain/service-registry";
import { REGISTRATION_MTLS_AUTH } from "../registration-auth";
import { REGISTRATION_IP_ALLOWLIST } from "../registration-ip-allowlist";
import { DISCOVERY_API } from "./api-routes";
import { createRegisterController } from "./register.controller";
import { createRegistryQueries } from "./registry-queries";

const REGISTER_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 30,
	standardHeaders: true,
	legacyHeaders: false,
	message: {
		error: "Too many registration requests, please try again later",
	},
});

export const REGISTRY_ROUTES = (registry: ServiceRegistry): Router => {
	const { register } = createRegisterController(registry);
	const queries = createRegistryQueries(registry);

	const router = Router();

	// The caller's identity is checked before the body: an unknown caller
	// learns nothing from validation errors.
	mountRoute(router, DISCOVERY_API.register, register, {
		middlewares: [
			REGISTRATION_IP_ALLOWLIST,
			REGISTRATION_MTLS_AUTH,
			REGISTER_LIMITER,
		],
	});
	mountRoute(router, DISCOVERY_API.listServices, queries.listServices);
	mountRoute(
		router,
		DISCOVERY_API.getServiceInstances,
		queries.getServiceInstances
	);
	mountRoute(router, DISCOVERY_API.getInstance, queries.getInstance);

	return router;
};
