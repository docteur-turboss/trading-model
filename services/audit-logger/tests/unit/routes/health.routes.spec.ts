import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const MOCK_ROUTER = {
	get: jest.fn(),
};
const MOCK_CONTROLLER = { health: jest.fn() };

jest.mock("express", () => ({
	Router: jest.fn(() => MOCK_ROUTER),
}));

jest.mock("../../../src/controllers/health.controller", () => ({
	createHealthController: jest.fn(() => MOCK_CONTROLLER),
}));

jest.mock("../../../src/config/metrics", () => ({
	BACKPRESSURE_RATIO: { set: jest.fn() },
	JOB_COUNT: { set: jest.fn() },
	WORKER_COUNT: { set: jest.fn() },
}));

import {
	BACKPRESSURE_RATIO,
	JOB_COUNT,
	WORKER_COUNT,
} from "../../../src/config/metrics";
import { healthRoutes } from "../../../src/routes/health.routes";

interface SchedulerMocks {
	queue: { depth: ReturnType<typeof jest.fn> };
	backPressure: { canAccept: ReturnType<typeof jest.fn> };
	workers: { store: { size: ReturnType<typeof jest.fn> } };
}

function mockScheduler(
	options: { canAccept?: boolean; depth?: number; workerCount?: number } = {}
): SchedulerMocks {
	return {
		queue: { depth: jest.fn().mockReturnValue(options.depth ?? 0) },
		backPressure: {
			canAccept: jest.fn().mockReturnValue(options.canAccept ?? true),
		},
		workers: {
			store: { size: jest.fn().mockReturnValue(options.workerCount ?? 0) },
		},
	};
}

describe("healthRoutes", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	it("should register GET /health with a wrapped handler", () => {
		const { queue, backPressure, workers } = mockScheduler();

		const router = healthRoutes(
			queue as any,
			backPressure as any,
			workers as any
		);

		expect(router).toBe(MOCK_ROUTER);
		expect(MOCK_ROUTER.get).toHaveBeenCalledTimes(1);
		expect(MOCK_ROUTER.get.mock.calls[0][0]).toBe("/health");
		expect(typeof MOCK_ROUTER.get.mock.calls[0][1]).toBe("function");
	});

	it("should record scheduler metrics and delegate to the controller when not backpressured", async () => {
		const { queue, backPressure, workers } = mockScheduler({
			canAccept: true,
			depth: 4,
			workerCount: 3,
		});
		healthRoutes(queue as any, backPressure as any, workers as any);
		const handler = MOCK_ROUTER.get.mock.calls[0][1];

		const result = await handler({}, {}, {});

		expect(JOB_COUNT.set).toHaveBeenCalledWith({ status: "queued" }, 4);
		expect(BACKPRESSURE_RATIO.set).toHaveBeenCalledWith(0);
		expect(WORKER_COUNT.set).toHaveBeenCalledWith({ status: "registered" }, 3);
		expect(MOCK_CONTROLLER.health).toHaveBeenCalledWith({}, {}, {});
		expect(result).toBeUndefined();
	});

	it("should record backpressure ratio as 1 when at capacity", async () => {
		const { queue, backPressure, workers } = mockScheduler({
			canAccept: false,
		});
		healthRoutes(queue as any, backPressure as any, workers as any);
		const handler = MOCK_ROUTER.get.mock.calls[0][1];

		await handler({}, {}, {});

		expect(BACKPRESSURE_RATIO.set).toHaveBeenCalledWith(1);
	});
});
