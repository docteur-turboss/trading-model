import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { HealthStateManager } from "../../src/core/health-state-manager";

describe("HealthStateManager", () => {
	let manager: HealthStateManager;

	beforeEach(() => {
		jest.clearAllMocks();
		manager = new HealthStateManager(3);
	});

	describe("initial state", () => {
		it("should be healthy initially", () => {
			expect(manager.isHealthy).toBe(true);
		});

		it("should have 0 consecutive failures initially", () => {
			expect(manager.consecutiveFailures).toBe(0);
		});
	});

	describe("markUnhealthy", () => {
		it("should set healthy to false", () => {
			manager.markUnhealthy();
			expect(manager.isHealthy).toBe(false);
		});

		it("should set consecutiveFailures to threshold", () => {
			manager.markUnhealthy();
			expect(manager.consecutiveFailures).toBe(3);
		});
	});

	describe("isHealthy", () => {
		it("should return true initially", () => {
			expect(manager.isHealthy).toBe(true);
		});

		it("should return false after markUnhealthy", () => {
			manager.markUnhealthy();
			expect(manager.isHealthy).toBe(false);
		});

		it("should return false when failures exceed threshold", () => {
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			expect(manager.isHealthy).toBe(false);
		});

		it("should return true when failures below threshold", () => {
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			expect(manager.isHealthy).toBe(true);
		});
	});

	describe("handleHealthSuccess", () => {
		it("should reset consecutiveFailures to 0", () => {
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			manager.handleHealthSuccess();
			expect(manager.consecutiveFailures).toBe(0);
		});

		it("should call onRestored when transitioning from unhealthy to healthy", () => {
			manager.markUnhealthy();
			const onRestored = jest.fn();
			manager.handleHealthSuccess(onRestored);
			expect(onRestored).toHaveBeenCalled();
			expect(manager.isHealthy).toBe(true);
		});

		it("should not call onRestored when already healthy", () => {
			const onRestored = jest.fn();
			manager.handleHealthSuccess(onRestored);
			expect(onRestored).not.toHaveBeenCalled();
			expect(manager.isHealthy).toBe(true);
		});

		it("should log info when restoring health", () => {
			manager.markUnhealthy();
			manager.handleHealthSuccess();

			const { logger } = jest.requireMock<{
				logger: { info: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.info).toHaveBeenCalledWith(
				"Redis backend is healthy again — resumed normal operation"
			);
		});

		it("should handle undefined onRestored callback", () => {
			manager.markUnhealthy();
			expect(() => manager.handleHealthSuccess()).not.toThrow();
			expect(manager.isHealthy).toBe(true);
		});
	});

	describe("handleHealthFailure", () => {
		it("should increment consecutiveFailures", () => {
			manager.handleHealthFailure();
			expect(manager.consecutiveFailures).toBe(1);
			manager.handleHealthFailure();
			expect(manager.consecutiveFailures).toBe(2);
		});

		it("should set healthy to false when threshold is met", () => {
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			expect(manager.isHealthy).toBe(false);
		});

		it("should call onLost when threshold is met", () => {
			const onLost = jest.fn();
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			manager.handleHealthFailure(onLost);
			expect(onLost).toHaveBeenCalled();
		});

		it("should not call onLost before threshold is met", () => {
			const onLost = jest.fn();
			manager.handleHealthFailure(onLost);
			expect(onLost).not.toHaveBeenCalled();
			expect(manager.isHealthy).toBe(true);
		});

		it("should log error when threshold is exceeded", () => {
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			manager.handleHealthFailure();

			const { logger } = jest.requireMock<{
				logger: { error: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.error).toHaveBeenCalledWith(
				"Redis backend unhealthy — serving stale cache",
				expect.objectContaining({ consecutiveFailures: 3 })
			);
		});

		it("should handle undefined onLost callback", () => {
			manager.handleHealthFailure();
			manager.handleHealthFailure();
			expect(() => manager.handleHealthFailure()).not.toThrow();
			expect(manager.isHealthy).toBe(false);
		});
	});

	describe("threshold edge cases", () => {
		it("should work with threshold of 1", () => {
			const m = new HealthStateManager(1);
			expect(m.isHealthy).toBe(true);
			m.handleHealthFailure();
			expect(m.isHealthy).toBe(false);
			expect(m.consecutiveFailures).toBe(1);
		});

		it("should work with threshold of 0", () => {
			const m = new HealthStateManager(0);
			m.handleHealthFailure();
			expect(m.isHealthy).toBe(false);
		});
	});
});
