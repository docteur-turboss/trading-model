import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { createNext, createReq, createRes } from "../../helpers/express";
import {
	mockCatchSyncModule,
	mockSendResponseModule,
} from "../../helpers/middleware-mocks";

jest.mock(
	"@trading-model/http/adapters/inbound/catch-error",
	() => mockCatchSyncModule
);
jest.mock(
	"@trading-model/http/adapters/inbound/response-exception",
	() => mockSendResponseModule
);

import { createHealthController } from "../../../src/adapters/inbound/http/health.controller";
import type { WorkerRegistry } from "../../../src/application/scheduler/worker-registry";
import { createWorkerRegistry } from "../../../src/application/scheduler/worker-registry";
import { BackPressure } from "../../../src/domain/scheduler/back-pressure";
import { InternalQueue } from "../../../src/domain/scheduler/internal-queue";

describe("HealthController", () => {
	let queue: InternalQueue;
	let backPressure: BackPressure;
	let workers: WorkerRegistry;
	let controller: ReturnType<typeof createHealthController>;

	beforeEach(() => {
		queue = new InternalQueue(30000);
		backPressure = new BackPressure(100, 0.85);
		workers = createWorkerRegistry(30000);
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
