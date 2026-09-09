import { describe, expect, it, jest } from "@jest/globals";

const MOCK_AUTO_RETRY_TICK = jest.fn();
const MOCK_START_REDIS_WORKER = jest.fn();
const MOCK_STOP_REDIS_WORKER = jest.fn();
const MOCK_IS_SHUTTING_DOWN = jest.fn();

jest.mock("../../src/infrastructure/config/env", () => ({
	ENV: {
		DLQ_AUTO_RETRY_ENABLED: true,
		DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
	},
}));

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/shared/auto-retry", () => ({
	autoRetryTick: MOCK_AUTO_RETRY_TICK,
}));

jest.mock("../../src/application/services/redis-queue-processor", () => ({
	startRedisWorkerLoop: MOCK_START_REDIS_WORKER,
	stopRedisWorkerTimer: MOCK_STOP_REDIS_WORKER,
}));

jest.mock("../../src/dlq/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

describe("auto-retry-scheduler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should start auto retry when enabled", () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_AUTO_RETRY_TICK.mockResolvedValue(undefined);

		const { startAutoRetry } = jest.requireActual(
			"../../src/infrastructure/auto-retry-scheduler"
		) as { startAutoRetry: () => void; stopAutoRetry: () => void };

		startAutoRetry();

		expect(MOCK_START_REDIS_WORKER).toHaveBeenCalled();
	});

	it("should not start auto retry when disabled", () => {
		const envMock = jest.requireMock("../../src/infrastructure/config/env") as {
			ENV: { DLQ_AUTO_RETRY_ENABLED: boolean };
		};
		envMock.ENV.DLQ_AUTO_RETRY_ENABLED = false;

		const { startAutoRetry } = jest.requireActual(
			"../../src/infrastructure/auto-retry-scheduler"
		) as { startAutoRetry: () => void };

		startAutoRetry();

		expect(MOCK_START_REDIS_WORKER).not.toHaveBeenCalled();
	});

	it("should stop auto retry", () => {
		const { stopAutoRetry } = jest.requireActual(
			"../../src/infrastructure/auto-retry-scheduler"
		) as { stopAutoRetry: () => void };

		stopAutoRetry();

		expect(MOCK_STOP_REDIS_WORKER).toHaveBeenCalled();
	});

	it("should handle auto retry tick errors", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_AUTO_RETRY_TICK.mockRejectedValue(new Error("tick failed"));
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock };
		};

		const { stopAutoRetry } = jest.requireActual(
			"../../src/infrastructure/auto-retry-scheduler"
		) as { stopAutoRetry: () => void };

		stopAutoRetry();

		expect(logger.logger.error).not.toHaveBeenCalled();
	});
});
