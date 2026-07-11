import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import type { RegistryBackend } from "@trading-model/common/contracts/service-registry.types";
import type { FallbackManager } from "../../src/core/fallback-manager";
import { FallbackRestoreHandler } from "../../src/core/fallback-restore-handler";
import type { HealthStateManager } from "../../src/core/health-state-manager";
import type { HealthCheckCallbacks } from "../../src/core/redis-health-monitor";

function createMockHealthState(): jest.Mocked<HealthStateManager> {
	return {
		isHealthy: false,
		consecutiveFailures: 3,
		markUnhealthy: jest.fn(),
		handleHealthSuccess: jest.fn(),
		handleHealthFailure: jest.fn(),
	} as jest.Mocked<HealthStateManager>;
}

function createMockFallbackManager(): jest.Mocked<FallbackManager> {
	return {
		fallbackActive: true,
		currentBackend: {} as RegistryBackend,
		setFallbackBackend: jest.fn(),
		stopBackend: jest.fn(),
		startRestoreLoop: jest.fn(),
		clearRestoreTimer: jest.fn(),
		restoreOriginalBackend: jest.fn(),
	} as jest.Mocked<FallbackManager>;
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

describe("FallbackRestoreHandler", () => {
	let healthState: jest.Mocked<HealthStateManager>;
	let fallbackManager: jest.Mocked<FallbackManager>;
	let callbacks: HealthCheckCallbacks;
	let handler: FallbackRestoreHandler;

	beforeEach(() => {
		jest.clearAllMocks();
		healthState = createMockHealthState();
		fallbackManager = createMockFallbackManager();
		callbacks = createMockCallbacks();
		handler = new FallbackRestoreHandler(
			healthState,
			fallbackManager,
			callbacks
		);
	});

	describe("performRestoreCheck", () => {
		it("should skip when healthState.isHealthy is true", async () => {
			healthState.isHealthy = true;
			await handler.performRestoreCheck();
			expect(callbacks.ping).not.toHaveBeenCalled();
			expect(fallbackManager.restoreOriginalBackend).not.toHaveBeenCalled();
		});

		it("should restore when ping succeeds", async () => {
			(callbacks.ping as jest.Mock).mockResolvedValue(true);
			await handler.performRestoreCheck();

			expect(fallbackManager.restoreOriginalBackend).toHaveBeenCalled();
			expect(healthState.handleHealthSuccess).toHaveBeenCalledWith(
				expect.any(Function)
			);

			const onRestored = healthState.handleHealthSuccess.mock.calls[0][0];
			onRestored!();
			expect(callbacks.onHealthRestored).toHaveBeenCalled();
		});

		it("should not restore when ping returns false", async () => {
			(callbacks.ping as jest.Mock).mockResolvedValue(false);
			await handler.performRestoreCheck();

			expect(fallbackManager.restoreOriginalBackend).not.toHaveBeenCalled();
			expect(healthState.handleHealthSuccess).not.toHaveBeenCalled();
		});

		it("should log warn when ping throws", async () => {
			(callbacks.ping as jest.Mock).mockRejectedValue(
				new Error("connection refused")
			);
			await handler.performRestoreCheck();

			const { logger } = jest.requireMock<{
				logger: { warn: jest.Mock };
			}>("@trading-model/common/config/logger");
			expect(logger.warn).toHaveBeenCalledWith(
				"Redis restore attempt failed — staying on stale cache"
			);
			expect(fallbackManager.restoreOriginalBackend).not.toHaveBeenCalled();
		});
	});
});
