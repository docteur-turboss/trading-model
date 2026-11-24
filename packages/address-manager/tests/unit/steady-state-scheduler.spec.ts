import { beforeEach, describe, expect, it, jest } from "@jest/globals";
import { InstanceId, ServiceId } from "@trading-model/primitives/primitives";
import type { ScheduledJob } from "../../src/scheduler/scheduler";
import type { SteadyStateSchedulerOptions } from "../../src/scheduler/steady-state-scheduler";
import { SteadyStateScheduler } from "../../src/scheduler/steady-state-scheduler";

const MOCK_SCHEDULER_INSTANCE = {
	register: jest.fn<(job: unknown) => void>(),
	start: jest.fn<() => void>(),
	stop: jest.fn<() => void>(),
};

jest.mock("../../src/scheduler/scheduler", () => ({
	Scheduler: jest
		.fn<(...args: any[]) => any>()
		.mockImplementation(() => MOCK_SCHEDULER_INSTANCE),
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
		serviceName: "test-service" as never,
		instanceId: "test-instance" as never,
		tokenRefreshIntervalMs: 60_000,
		ttlRefreshIntervalMs: 30_000,
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

	it("setup() should register token refresh and heartbeat jobs", () => {
		expect(() => scheduler.setup()).not.toThrow();
		expect(MOCK_SCHEDULER_INSTANCE.register).toHaveBeenCalledTimes(2);
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
			serviceName: ServiceId.of("test-service"),
			instanceId: InstanceId.of("test-instance"),
		});
	});
});
