import { catchSync } from "@trading-model/common/middleware/catch-error";
import { sendResponse } from "@trading-model/common/middleware/response-exception";
import type { RequestHandler } from "express";

import type { BackPressure } from "../scheduler/back-pressure";
import type { InternalQueue } from "../scheduler/internal-queue";
import type { WorkerRegistry } from "../worker/worker-registry";

export function createHealthController(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry
) {
	const ping: RequestHandler = catchSync(() => {
		return sendResponse(
			{ status: "ok", timestamp: new Date().toISOString() },
			200
		);
	});

	const health: RequestHandler = catchSync(() => {
		const queueDepth = queue.depth();

		return sendResponse(
			{
				status: "ok",
				queueDepth,
				canAccept: backPressure.canAccept(),
				workerCount: workers.count(),
				averageLoad: workers.averageLoad(),
				timestamp: new Date().toISOString(),
			},
			200
		);
	});

	return { ping, health };
}
