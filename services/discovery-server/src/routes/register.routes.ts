import { Router } from "express";
import rateLimit from "express-rate-limit";

import {
	REGISTRATION_AUTH,
	REGISTRATION_MTLS_AUTH,
} from "../adapters/inbound/registration-auth";
import { REGISTRATION_IP_ALLOWLIST } from "../adapters/inbound/registration-ip-allowlist";
import { createRegisterController } from "../controllers/register.controller";
import type { ServiceRegistry } from "../domain/service-registry";

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
	const { register, listServices, getServiceInstances, getInstance } =
		createRegisterController(registry);

	const router = Router();

	router.post(
		"/register",
		REGISTRATION_IP_ALLOWLIST,
		REGISTRATION_MTLS_AUTH,
		REGISTRATION_AUTH,
		REGISTER_LIMITER,
		register
	);
	router.get("/services", listServices);
	router.get("/services/:serviceName", getServiceInstances);
	router.get("/services/:serviceName/:instanceId", getInstance);

	return router;
};
