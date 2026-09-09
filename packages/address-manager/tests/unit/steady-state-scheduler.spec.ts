import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import {
	toInstanceId,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import type { SteadyStateSchedulerOptions } from "../../src/application/scheduler/steady-state-scheduler";
import { SteadyStateScheduler } from "../../src/application/scheduler/steady-state-scheduler";
import type { IServiceCache } from "../../src/domain/discovery/service-cache.interface";
import type { ScheduledJob } from "../../src/infrastructure/scheduler/scheduler";

const MOCK_SCHEDULER_INSTANCE = {
	register: jest.fn<(job: unknown) => void>(),
	start: jest.fn<() => void>(),
	stop: jest.fn<() => void>(),
};

jest.mock("../../src/infrastructure/scheduler/scheduler", () => ({
	Scheduler: jest.fn().mockImplementation(() => MOCK_SCHEDULER_INSTANCE),
}));

function createMockOptions(): jest.Mocked<SteadyStateSchedulerOptions> {
	return {
		tokenManager: {
			refreshToken: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
		} as never,
		addressManagerClient: {} as never,
		heartbeatManager: {
			sendHeartbeat: jest
				.fn<() => Promise<void>>()
				.mockResolvedValue(undefined),
		} as never,
		serviceCache: {
			entries: jest.fn<() => Promise<never[]>>().mockResolvedValue([]),
		} as never,
		healthChecker: {} as never,
		serviceName: "test-service" as never,
		instanceId: "test-instance" as never,
		tokenRefreshIntervalMs: 60_000,
		ttlRefreshIntervalMs: 30_000,
		cacheTtlMs: 10_000 as never,
	};
}

describe("SteadyStateScheduler", () => {
	let scheduler: SteadyStateScheduler;
	let options: ReturnType<typeof createMockOptions>;

	beforeEach(() => {
		jest.clearAllMocks();
		options = createMockOptions();
		scheduler = new SteadyStateScheduler(options);
	});

	it("should store options in constructor", () => {
		expect(scheduler).toBeDefined();
	});

	it("setup() should register token refresh, heartbeat, and cache refresh jobs", () => {
		expect(() => scheduler.setup()).not.toThrow();
		expect(MOCK_SCHEDULER_INSTANCE.register).toHaveBeenCalledTimes(3);
	});

	it("start() should delegate to internal scheduler", () => {
		scheduler.setup();
		expect(() => scheduler.start()).not.toThrow();
		expect(MOCK_SCHEDULER_INSTANCE.start).toHaveBeenCalledTimes(1);
	});

	it("stop() should delegate to internal scheduler", () => {
		scheduler.setup();
		scheduler.start();
		expect(() => scheduler.stop()).not.toThrow();
		expect(MOCK_SCHEDULER_INSTANCE.stop).toHaveBeenCalledTimes(1);
	});

	it("should skip cache refresh when serviceCache is RedisServiceCache", () => {
		const mod = jest.requireActual(
			"../../src/adapters/outbound/discovery/redis-service-cache"
		) as {
			RedisServiceCache: new (config: { redisUrl: string }) => IServiceCache;
		};
		const redisScheduler = new SteadyStateScheduler({
			...options,
			serviceCache: new mod.RedisServiceCache({
				redisUrl: "redis://localhost:6379",
			}),
		});
		redisScheduler.setup();
		expect(MOCK_SCHEDULER_INSTANCE.register).toHaveBeenCalledTimes(2);
	});

	it("token refresh job should call tokenManager.refreshToken()", async () => {
		scheduler.setup();
		const job = MOCK_SCHEDULER_INSTANCE.register.mock
			.calls[0][0] as ScheduledJob;
		await job.execute();
		expect(options.tokenManager.refreshToken).toHaveBeenCalledTimes(1);
	});

	it("heartbeat job should call heartbeatManager.sendHeartbeat() with correct identity", async () => {
		scheduler.setup();
		const job = MOCK_SCHEDULER_INSTANCE.register.mock
			.calls[1][0] as ScheduledJob;
		await job.execute();
		expect(options.heartbeatManager.sendHeartbeat).toHaveBeenCalledWith({
			serviceName: toServiceId("test-service"),
			instanceId: toInstanceId("test-instance"),
		});
	});
});
