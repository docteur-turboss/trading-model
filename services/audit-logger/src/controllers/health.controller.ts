import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";

import type { BackPressure } from "../scheduler/back-pressure";
import type { InternalQueue } from "../scheduler/internal-queue";
import type { WorkerRegistry } from "../worker/worker-registry";

function _pingResponse(): ResponseObject {
	return sendResponse(
		{ status: "ok", timestamp: new Date().toISOString() },
		200
	);
}

function _healthResponse(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
): ResponseObject {
	return sendResponse(
		{
			status: "ok",
			queueDepth: queue.depth(),
			canAccept: backPressure.canAccept(),
			workerCount: workers.count(),
			averageLoad: workers.averageLoad(),
			timestamp: new Date().toISOString(),
		},
		200
	);
}

export function createHealthController(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
) {
	const ping: RequestHandler = catchSync(() => _pingResponse());

	const health: RequestHandler = catchSync(() =>
		_healthResponse(queue, backPressure, workers)
	);

	return { ping, health };
}
