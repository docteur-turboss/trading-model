import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";
import { FallbackManager } from "../../src/core/fallback-manager";
import type { HealthCheckCallbacks } from "../../src/core/redis-health-monitor";

function createMockBackend(_name = "primary"): RegistryBackend {
	return {
		registerInstance: jest.fn(),
		updateHeartbeat: jest.fn(),
		updateToken: jest.fn(),
		getInstances: jest.fn(),
		getInstance: jest.fn(),
		removeInstance: jest.fn(),
		listServiceNames: jest.fn(),
		dump: jest.fn(),
		validInstanceToken: jest.fn(),
		generateInstanceToken: jest.fn(),
		verifyInstanceName: jest.fn(),
		generateInstanceId: jest.fn(),
		start: jest.fn(),
		stop: jest.fn(),
	};
}

function createMockCallbacks(): HealthCheckCallbacks {
	return {
		ping: jest.fn(),
		onHealthLost: jest.fn(),
		onHealthRestored: jest.fn(),
		onFallbackActivated: jest.fn(),
		onFallbackRestored: jest.fn(),
	};
}

describe("FallbackManager", () => {
	let primaryBackend: RegistryBackend;
	let fallbackBackend: RegistryBackend;
	let callbacks: HealthCheckCallbacks;
	let manager: FallbackManager;

	beforeEach(() => {
		jest.useFakeTimers();
		jest.clearAllMocks();
		primaryBackend = createMockBackend("primary");
		fallbackBackend = createMockBackend("fallback");
		callbacks = createMockCallbacks();
		manager = new FallbackManager(primaryBackend, 30000, callbacks);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	describe("fallbackActive", () => {
		it("should return false initially", () => {
			expect(manager.fallbackActive).toBe(false);
		});

		it("should return true after setFallbackBackend", () => {
			manager.setFallbackBackend(fallbackBackend);
			expect(manager.fallbackActive).toBe(true);
		});

		it("should return false after restoreOriginalBackend", () => {
			manager.setFallbackBackend(fallbackBackend);
			manager.restoreOriginalBackend();
			expect(manager.fallbackActive).toBe(false);
		});
	});

	describe("currentBackend", () => {
		it("should return primary backend initially", () => {
			expect(manager.currentBackend).toBe(primaryBackend);
		});

		it("should return fallback backend after setFallbackBackend", () => {
			manager.setFallbackBackend(fallbackBackend);
			expect(manager.currentBackend).toBe(fallbackBackend);
		});

		it("should return primary backend after restoreOriginalBackend", () => {
			manager.setFallbackBackend(fallbackBackend);
			manager.restoreOriginalBackend();
			expect(manager.currentBackend).toBe(primaryBackend);
		});
	});

	describe("setFallbackBackend", () => {
		it("should log warn and trigger onFallbackActivated callback", () => {
			manager.setFallbackBackend(fallbackBackend);

			const { logger } = jest.requireMock<{
				logger: { warn: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.warn).toHaveBeenCalledWith(
				"FallbackManager.setFallbackBackend — swapping to fallback backend"
			);
			expect(callbacks.onFallbackActivated).toHaveBeenCalledWith(
				fallbackBackend
			);
		});
	});

	describe("stopBackend", () => {
		it("should stop both primary and current backend", () => {
			manager.setFallbackBackend(fallbackBackend);
			manager.stopBackend();
			expect(primaryBackend.stop).toHaveBeenCalled();
			expect(fallbackBackend.stop).toHaveBeenCalled();
		});

		it("should stop primary twice when no fallback set", () => {
			manager.stopBackend();
			expect(primaryBackend.stop).toHaveBeenCalledTimes(2);
		});
	});

	describe("startRestoreLoop", () => {
		it("should call restoreFn on interval", () => {
			const restoreFn = jest.fn().mockResolvedValue(undefined);
			manager.startRestoreLoop(restoreFn);

			expect(restoreFn).not.toHaveBeenCalled();

			jest.advanceTimersByTime(30000);
			expect(restoreFn).toHaveBeenCalledTimes(1);

			jest.advanceTimersByTime(30000);
			expect(restoreFn).toHaveBeenCalledTimes(2);
		});
	});

	describe("clearRestoreTimer", () => {
		it("should stop the restore timer", () => {
			const restoreFn = jest.fn().mockResolvedValue(undefined);
			manager.startRestoreLoop(restoreFn);
			manager.clearRestoreTimer();

			jest.advanceTimersByTime(30000);
			expect(restoreFn).not.toHaveBeenCalled();
		});
	});

	describe("restoreOriginalBackend", () => {
		it("should be a no-op when fallback is not active", () => {
			manager.restoreOriginalBackend();
			expect(callbacks.onFallbackRestored).not.toHaveBeenCalled();
		});

		it("should restore primary and call onFallbackRestored", () => {
			manager.setFallbackBackend(fallbackBackend);
			manager.restoreOriginalBackend();

			expect(manager.currentBackend).toBe(primaryBackend);
			expect(callbacks.onFallbackRestored).toHaveBeenCalledWith(primaryBackend);

			const { logger } = jest.requireMock<{
				logger: { info: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.info).toHaveBeenCalledWith(
				"Restored original Redis backend"
			);
		});
	});
});
