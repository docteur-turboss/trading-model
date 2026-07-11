import { beforeEach, describe, expect, it, jest } from "@jest/globals";

import {
	mockCatchSyncModule,
	mockSendResponseModule,
} from "@trading-model/common/testing";
import { createNext, createReq, createRes } from "../../helpers/express";

jest.mock(
	"@trading-model/common/middleware/catch-error",
	() => mockCatchSyncModule
);
jest.mock(
	"@trading-model/common/middleware/response-exception",
	() => mockSendResponseModule
);

import { createHealthController } from "../../../src/controllers/health.controller";
import { BackPressure } from "../../../src/scheduler/back-pressure";
import { InternalQueue } from "../../../src/scheduler/internal-queue";
import { WorkerRegistry } from "../../../src/worker/worker-registry";

describe("HealthController", () => {
	let queue: InternalQueue;
	let backPressure: BackPressure;
	let workers: WorkerRegistry;
	let controller: ReturnType<typeof createHealthController>;

	beforeEach(() => {
		queue = new InternalQueue(30000);
		backPressure = new BackPressure(100, 0.85);
		workers = new WorkerRegistry(30000);
		controller = createHealthController(queue, backPressure, workers);
	});

	describe("health", () => {
		it("should return 200 with health metrics", async () => {
			queue.enqueue({
				id: "j1" as any,
				type: "t" as any,
				payload: {},
				priority: 3 as any,
				status: "queued" as any,
				ackDeadline: 0 as any,
				maxRetries: 3 as any,
				retryCount: 0 as any,
				createdAt: new Date() as any,
				history: [],
			});

			const result = await controller.health(
				createReq(),
				createRes(),
				createNext
			);

			expect(result).toMatchObject({ status: 200 });
			expect((result as any).data).toMatchObject({
				status: "ok",
				queueDepth: 1,
				canAccept: true,
				workerCount: 0,
				averageLoad: 0,
			});
			expect((result as any).data).toHaveProperty("timestamp");
		});
	});
});
