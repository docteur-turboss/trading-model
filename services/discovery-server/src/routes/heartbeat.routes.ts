import { Router } from "express";
import rateLimit from "express-rate-limit";

import { createHeartbeatController } from "../controllers/heartbeat.controller";
import type { ServiceRegistry } from "../core/service-registry";

const HEARTBEAT_LIMITER = rateLimit({
	windowMs: 60_000,
	max: 60,
	standardHeaders: true,
	legacyHeaders: false,
	message: { error: "Too many heartbeat requests, please try again later" },
});

export const HEARTBEAT_ROUTES = (registry: ServiceRegistry): Router => {
	const { heartbeat, rotateToken } = createHeartbeatController(registry);

	const router = Router();

	router.post("/heartbeat", HEARTBEAT_LIMITER, heartbeat);
	router.post("/token/rotate", HEARTBEAT_LIMITER, rotateToken);

	return router;
};
