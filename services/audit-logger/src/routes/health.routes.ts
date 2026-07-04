import { Router } from "express";

import { createHealthController } from "../controllers/health.controller";
import type { BackPressure } from "../scheduler/back-pressure";
import type { InternalQueue } from "../scheduler/internal-queue";
import type { WorkerRegistry } from "../worker/worker-registry";

export function healthRoutes(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
): Router {
	const router = Router();
	const controller = createHealthController(queue, backPressure, workers);

	router.get("/ping", controller.ping);
	router.get("/health", controller.health);

	return router;
}
