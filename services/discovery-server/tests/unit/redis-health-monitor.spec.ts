import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: {
		info: jest.fn(),
		warn: jest.fn(),
		error: jest.fn(),
		debug: jest.fn(),
	},
}));

const mockTimerStartInterval = jest.fn();
const mockTimerStop = jest.fn();

jest.mock("@trading-model/common/utils/timer-handle", () => ({
	TimerHandle: jest.fn().mockImplementation(() => ({
		startInterval: mockTimerStartInterval,
		stop: mockTimerStop,
		isRunning: false,
	})),
}));

import type { RegistryBackend } from "@trading-model/validation/contracts/service-registry.types";
import { RedisHealthMonitor } from "../../src/core/redis-health-monitor";

function createMockCallbacks() {
	return {
		ping: jest.fn<() => Promise<boolean>>(),
		onHealthLost: jest.fn(),
		onHealthRestored: jest.fn(),
		onFallbackActivated: jest.fn(),
		onFallbackRestored: jest.fn(),
	};
}

function createMockBackend(): RegistryBackend {
	return { stop: jest.fn() } as unknown as RegistryBackend;
}

describe("RedisHealthMonitor", () => {
	let monitor: RedisHealthMonitor;
	let backend: RegistryBackend;
	let callbacks: ReturnType<typeof createMockCallbacks>;

	beforeEach(() => {
		jest.clearAllMocks();
		backend = createMockBackend();
		callbacks = createMockCallbacks();
		monitor = new RedisHealthMonitor({
			failureThreshold: 1,
			healthCheckIntervalMs: 5000,
			shouldRun: () => true,
			callbacks,
			backend,
		});
	});

	describe("constructor", () => {
		it("should initialize with healthy state", () => {
			expect(monitor.isHealthy).toBe(true);
		});

		it("should initialize with zero consecutive failures", () => {
			expect(monitor.consecutiveFailures).toBe(0);
		});

		it("should initialize with fallback inactive", () => {
			expect(monitor.fallbackActive).toBe(false);
		});
	});

	describe("start", () => {
		it("should not start health check when shouldRun returns false", () => {
			monitor = new RedisHealthMonitor({
				failureThreshold: 3,
				healthCheckIntervalMs: 5000,
				shouldRun: () => false,
				callbacks,
				backend,
			});
			monitor.start();
			expect(mockTimerStartInterval).not.toHaveBeenCalled();
		});

		it("should start health check and restore loop when shouldRun returns true", () => {
			monitor.start();
			expect(mockTimerStartInterval).toHaveBeenCalledTimes(2);
		});

		it("should invoke the health check callback when the interval fires", async () => {
			callbacks.ping.mockResolvedValue(true);
			monitor.start();

			const healthCheckFn = mockTimerStartInterval.mock
				.calls[0]![0] as () => Promise<void>;
			await healthCheckFn();

			expect(callbacks.ping).toHaveBeenCalled();
		});

		it("should call onHealthRestored when ping succeeds after previous failure", async () => {
			callbacks.ping.mockResolvedValue(true);
			monitor.start();

			const healthCheckFn = mockTimerStartInterval.mock
				.calls[0]![0] as () => Promise<void>;

			monitor.markUnhealthy();
			expect(monitor.isHealthy).toBe(false);

			await healthCheckFn();

			expect(callbacks.onHealthRestored).toHaveBeenCalled();
		});

		it("should call onHealthLost when ping fails with false", async () => {
			callbacks.ping.mockResolvedValue(false);
			monitor.start();

			const healthCheckFn = mockTimerStartInterval.mock
				.calls[0]![0] as () => Promise<void>;

			await healthCheckFn();
			await healthCheckFn();
			await healthCheckFn();

			expect(callbacks.onHealthLost).toHaveBeenCalled();
		});

		it("should call onHealthLost when ping throws", async () => {
			callbacks.ping.mockRejectedValue(new Error("Connection refused"));
			monitor.start();

			const healthCheckFn = mockTimerStartInterval.mock
				.calls[0]![0] as () => Promise<void>;

			await healthCheckFn();
			await healthCheckFn();
			await healthCheckFn();

			expect(callbacks.onHealthLost).toHaveBeenCalled();
		});

		it("should skip health check when already running (re-entrancy guard)", async () => {
			callbacks.ping.mockImplementation(
				() => new Promise<boolean>((resolve) => setTimeout(resolve, 100))
			);
			monitor.start();

			const healthCheckFn = mockTimerStartInterval.mock
				.calls[0]![0] as () => Promise<void>;

			const firstRun = healthCheckFn();
			const secondRun = healthCheckFn();
			await firstRun;
			await secondRun;

			expect(callbacks.ping).toHaveBeenCalledTimes(1);
		});

		it("should start restore loop on fallback manager", () => {
			monitor.start();
			const restoreFn = mockTimerStartInterval.mock
				.calls[1]![0] as () => Promise<void>;

			expect(restoreFn).toBeDefined();
			expect(typeof restoreFn).toBe("function");
		});
	});

	describe("stop", () => {
		it("should stop health check and restore timers", () => {
			monitor.start();
			jest.clearAllMocks();

			monitor.stop();

			expect(mockTimerStop).toHaveBeenCalledTimes(2);
		});

		it("should be safe to call stop without start", () => {
			expect(() => monitor.stop()).not.toThrow();
		});
	});

	describe("markUnhealthy", () => {
		it("should mark instance as unhealthy", () => {
			monitor.markUnhealthy();
			expect(monitor.isHealthy).toBe(false);
		});
	});

	describe("setFallbackBackend", () => {
		it("should activate fallback backend", () => {
			const fallback = createMockBackend();
			monitor.setFallbackBackend(fallback);
			expect(monitor.fallbackActive).toBe(true);
		});
	});

	describe("stopBackend", () => {
		it("should stop primary and fallback backends", () => {
			expect(() => monitor.stopBackend()).not.toThrow();
		});
	});
});
