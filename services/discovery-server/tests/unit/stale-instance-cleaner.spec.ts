import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

import type { LoggerPort } from "../../src/domain/logger-port";

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

import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import type {
	ServiceInstance,
	ServiceInstanceName,
} from "@trading-model/validation/domain/contracts/service-registry.types";
import type {
	CleanupDeps,
	SyncCleanupDeps,
} from "../../src/domain/stale-instance-cleaner";
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
		};

		cleaner = new StaleInstanceCleaner(deps, intervalMs);
	});

	describe("constructor", () => {
		it("should create an instance", () => {
			expect(cleaner).toBeInstanceOf(StaleInstanceCleaner);
		});

		it("should initially not be running", () => {
			expect(cleaner.isRunning).toBe(false);
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

	describe("removeStaleInstances", () => {
		it("should return the number of services removed after cleanup", async () => {
			deps.listServiceNames
				.mockResolvedValueOnce([
					"svc-a" as ServiceInstanceName,
					"svc-b" as ServiceInstanceName,
				])
				.mockResolvedValueOnce(["svc-a" as ServiceInstanceName])
				.mockResolvedValueOnce(["svc-a" as ServiceInstanceName]);
			deps.getInstances.mockResolvedValue([]);

			const removed = await cleaner.removeStaleInstances();

			expect(removed).toBe(1);
			expect(deps.listServiceNames).toHaveBeenCalledTimes(3);
		});

		it("should return 0 when no services removed", async () => {
			deps.listServiceNames
				.mockResolvedValueOnce(["svc-a" as ServiceInstanceName])
				.mockResolvedValueOnce(["svc-a" as ServiceInstanceName])
				.mockResolvedValueOnce(["svc-a" as ServiceInstanceName]);
			deps.getInstances.mockResolvedValue([]);

			const removed = await cleaner.removeStaleInstances();

			expect(removed).toBe(0);
		});
	});

	describe("isAlive", () => {
		it("should return true for a recently heartbeated instance", () => {
			const alive = makeInstance({
				lastHeartbeat: Date.now() - 1000,
				ttl: 30000,
			});
			expect(cleaner.isAlive(alive)).toBe(true);
		});

		it("should return false for an expired instance", () => {
			const expired = makeInstance({
				lastHeartbeat: Date.now() - 100000,
				ttl: 5000,
			});
			expect(cleaner.isAlive(expired)).toBe(false);
		});
	});

	describe("cleanupSync", () => {
		it("should remove expired instances synchronously", () => {
			const expired = makeInstance({
				instanceId: "expired-1",
				lastHeartbeat: Date.now() - 100000,
				ttl: 5000,
			});
			const fresh = makeInstance({
				instanceId: "fresh-1",
				lastHeartbeat: Date.now(),
				ttl: 30000,
			});

			const syncDeps: SyncCleanupDeps = {
				listServiceNames: jest
					.fn<() => ServiceInstanceName[]>()
					.mockReturnValue([
						"financial-scraper-service" as ServiceInstanceName,
					]),
				getInstances: jest
					.fn<(name: ServiceInstanceName) => ServiceInstance[]>()
					.mockReturnValue([expired, fresh]),
				removeInstance: jest.fn<(id: ServiceIdentity) => void>(),
			};

			StaleInstanceCleaner.cleanupSync(syncDeps);

			expect(syncDeps.removeInstance).toHaveBeenCalledTimes(1);
			expect(syncDeps.removeInstance).toHaveBeenCalledWith(
				expect.objectContaining({ instanceId: "expired-1" })
			);
		});

		it("should not remove any instance when no services exist", () => {
			const syncDeps: SyncCleanupDeps = {
				listServiceNames: jest
					.fn<() => ServiceInstanceName[]>()
					.mockReturnValue([]),
				getInstances: jest.fn(),
				removeInstance: jest.fn(),
			};

			StaleInstanceCleaner.cleanupSync(syncDeps);

			expect(syncDeps.removeInstance).not.toHaveBeenCalled();
		});
	});
});
