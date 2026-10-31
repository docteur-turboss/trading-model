import { mountRoute } from "@trading-model/http/adapters/inbound/api-route/mount-route";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import type { ServiceRegistry } from "../../../domain/service-registry";
import { DISCOVERY_API } from "./api-routes";
import { createHeartbeatController } from "./heartbeat.controller";

const HEARTBEAT_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 60,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many heartbeat requests, please try again later" },
});

export const HEARTBEAT_ROUTES = (registry: ServiceRegistry): Router => {
	const { heartbeat, rotateToken, unregister } =
		createHeartbeatController(registry);

	const router = Router();

	const limited = { middlewares: [HEARTBEAT_LIMITER] };
	mountRoute(router, DISCOVERY_API.heartbeat, heartbeat, limited);
	mountRoute(router, DISCOVERY_API.rotateToken, rotateToken, limited);
	mountRoute(router, DISCOVERY_API.unregister, unregister, limited);

	return router;
};
