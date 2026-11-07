import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

import type { LoggerPort } from "@trading-model/contracts/logger-registry";

const mockTimerStartInterval = jest.fn();
const mockTimerStop = jest.fn();

jest.mock("@trading-model/common/utils/timer-handle", () => ({
	TimerHandle: jest.fn().mockImplementation(() => ({
		startInterval: mockTimerStartInterval,
		stop: mockTimerStop,
		isRunning: false,
	})),
}));

jest.mock("../../src/infrastructure/monitoring/metrics", () => ({
	incLeaseCleanupCycle: jest.fn(),
	incOperationError: jest.fn(),
	observeCleanupDuration: jest.fn(),
}));

import type { ServiceInstance } from "@trading-model/contracts/service-registry-types";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import type { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";
import type { CleanupDeps } from "../../src/domain/stale-instance-cleaner";
import { StaleInstanceCleaner } from "../../src/domain/stale-instance-cleaner";
import {
	incLeaseCleanupCycle,
	incOperationError,
	observeCleanupDuration,
} from "../../src/infrastructure/monitoring/metrics";

function makeLogger(): LoggerPort {
	return {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	};
}

function makeInstance(overrides?: Partial<ServiceInstance>): ServiceInstance {
	return {
		serviceName: "financial-scraper-service",
		instanceId: "test-instance-1",
		host: "192.168.1.10",
		port: 8444,
		version: "1.0.0",
		ttl: 30_000,
		protocol: "mtls",
		registeredAt: Date.now() - 1000,
		lastHeartbeat: Date.now() - 500,
		...overrides,
	};
}

describe("StaleInstanceCleaner", () => {
	let cleaner: StaleInstanceCleaner;
	let deps: jest.Mocked<CleanupDeps>;
	const intervalMs = 10000;

	beforeEach(() => {
		jest.clearAllMocks();

		deps = {
			listServiceNames: jest.fn<() => Promise<ServiceInstanceName[]>>(),
			getInstances:
				jest.fn<(name: ServiceInstanceName) => Promise<ServiceInstance[]>>(),
			removeInstance: jest.fn<(id: ServiceIdentity) => Promise<boolean>>(),
			logger: makeLogger(),
			metrics: {
				incLeaseCleanupCycle,
				incOperationError,
				observeCleanupDuration,
			},
		};

		cleaner = new StaleInstanceCleaner(deps, intervalMs);
	});

	describe("constructor", () => {
		it("should create an instance", () => {
			expect(cleaner).toBeInstanceOf(StaleInstanceCleaner);
		});
	});

	describe("start", () => {
		beforeEach(() => {
			jest.useFakeTimers();
		});

		afterEach(() => {
			jest.useRealTimers();
		});

		it("should start the cleanup interval after initial delay", () => {
			cleaner.start();
			jest.advanceTimersByTime(intervalMs);

			expect(mockTimerStartInterval).toHaveBeenCalledWith(
				expect.any(Function),
				intervalMs
			);
		});

		it("should count a cleanup operation error when the interval cleanup fails", async () => {
			deps.listServiceNames.mockRejectedValue(new Error("Redis down"));
			cleaner.start();
			jest.advanceTimersByTime(intervalMs);

			const callback = mockTimerStartInterval.mock.calls[0][0] as () => void;
			callback();
			await Promise.resolve();
			await Promise.resolve();
			await Promise.resolve();

			expect(incOperationError).toHaveBeenCalledWith("cleanup");
			expect((deps.logger as LoggerPort).error).toHaveBeenCalled();
		});

		it("should not start the interval when stopped during the initial delay", () => {
			cleaner.start();
			cleaner.stop();
			jest.advanceTimersByTime(intervalMs);

			expect(mockTimerStartInterval).not.toHaveBeenCalled();
		});

		it("should schedule a single start when started twice", () => {
			cleaner.start();
			cleaner.start();
			jest.advanceTimersByTime(intervalMs);

			expect(mockTimerStartInterval).toHaveBeenCalledTimes(1);
		});
	});

	describe("stop", () => {
		it("should stop the timer handle", () => {
			cleaner.stop();
			expect(mockTimerStop).toHaveBeenCalled();
		});
	});

	describe("cleanupNow", () => {
		it("should run cleanup immediately", async () => {
			const expired = makeInstance({
				instanceId: "expired-1",
				lastHeartbeat: Date.now() - 100000,
				ttl: 5000,
			});
			deps.listServiceNames.mockResolvedValue([
				"financial-scraper-service" as ServiceInstanceName,
			]);
			deps.getInstances.mockResolvedValue([expired]);
			deps.removeInstance.mockResolvedValue(true);

			await cleaner.cleanupNow();

			expect(deps.listServiceNames).toHaveBeenCalled();
			expect(deps.removeInstance).toHaveBeenCalled();
			expect(incLeaseCleanupCycle).toHaveBeenCalled();
			expect(observeCleanupDuration).toHaveBeenCalledWith(expect.any(Number));
		});

		it("should run afterCleanup once expired instances are removed", async () => {
			const order: string[] = [];
			deps.listServiceNames.mockResolvedValue([
				"financial-scraper-service" as ServiceInstanceName,
			]);
			deps.getInstances.mockResolvedValue([
				makeInstance({ lastHeartbeat: Date.now() - 100000, ttl: 5000 }),
			]);
			deps.removeInstance.mockImplementation(async () => {
				order.push("remove");
				return true;
			});
			deps.afterCleanup = jest.fn(async () => {
				order.push("after");
			});

			await cleaner.cleanupNow();

			expect(order).toEqual(["remove", "after"]);
		});

		it("should log error when cleanup throws", async () => {
			const logger = deps.logger as LoggerPort;

			deps.listServiceNames.mockRejectedValue(new Error("Redis down"));

			await cleaner.cleanupNow().catch(() => {});

			expect(logger.error).not.toHaveBeenCalled();
			expect(deps.listServiceNames).toHaveBeenCalled();
			expect(incLeaseCleanupCycle).toHaveBeenCalled();
			expect(observeCleanupDuration).toHaveBeenCalled();
		});
	});
});
