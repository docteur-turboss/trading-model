import type { HttpStatusCode } from "@trading-model/common/http-status";
import { catchSync } from "@trading-model/common/middleware/catch-error";
import {
	HEALTH_STATUS_OK,
	type ResponseObject,
	sendResponse,
} from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";

import type { BackPressure } from "../scheduler/back-pressure";
import type { InternalQueue } from "../scheduler/internal-queue";
import type { WorkerRegistry } from "../worker/worker-registry";

function _healthResponse(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
): ResponseObject {
	return sendResponse(
		{
			status: HEALTH_STATUS_OK,
			queueDepth: queue.depth(),
			canAccept: backPressure.canAccept(),
			workerCount: workers.store.size(),
			averageLoad: workers.healthMonitor.averageLoad(),
			timestamp: new Date().toISOString(),
		},
		200 as HttpStatusCode
	);
}

export function createHealthController(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
): { health: RequestHandler } {
	const health: RequestHandler = catchSync(() =>
		_healthResponse(queue, backPressure, workers)
	);

	return { health };
}
