import type { RequestHandler } from "express";
import { Router } from "express";

import { BACKPRESSURE_RATIO, JOB_COUNT, WORKER_COUNT } from "../config/metrics";
import { createHealthController } from "../controllers/health.controller";
import type { BackPressure } from "../scheduler/back-pressure";
import type { InternalQueue } from "../scheduler/internal-queue";
import type { WorkerRegistry } from "../worker/worker-registry";

function _recordSchedulerMetrics(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
): void {
	JOB_COUNT.set({ status: "queued" }, queue.depth());
	BACKPRESSURE_RATIO.set(backPressure.canAccept() ? 0 : 1);
	WORKER_COUNT.set({ status: "registered" }, workers.store.size());
}

export function healthRoutes(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
): Router {
	const router = Router();
	const controller = createHealthController(queue, backPressure, workers);

	const health: RequestHandler = (req, res, next) => {
		_recordSchedulerMetrics(queue, backPressure, workers);
		return controller.health(req, res, next);
	};

	router.get("/health", health);

	return router;
}
