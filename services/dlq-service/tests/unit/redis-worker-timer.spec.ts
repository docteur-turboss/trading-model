import { describe, expect, it, jest } from "@jest/globals";

const MOCK_IS_SHUTTING_DOWN = jest.fn();
const MOCK_TICK = jest.fn();

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../../src/dlq/shared/shutdown-flag", () => ({
	isShuttingDown: MOCK_IS_SHUTTING_DOWN,
}));

describe("RedisWorkerTimer", () => {
	let RedisWorkerTimerClass: new (
		tick: () => Promise<void>
	) => {
		start: () => void;
		stop: () => void;
	};

	beforeAll(() => {
		const mod = jest.requireActual(
			"../../src/infrastructure/redis-worker-timer"
		) as {
			RedisWorkerTimer: typeof RedisWorkerTimerClass;
		};
		RedisWorkerTimerClass = mod.RedisWorkerTimer;
	});

	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should start the timer loop", () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_TICK.mockResolvedValue(undefined);

		const timer = new RedisWorkerTimerClass(MOCK_TICK);
		timer.start();

		expect(MOCK_TICK).toHaveBeenCalled();
	});

	it("should schedule next tick after successful tick", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_TICK.mockResolvedValue(undefined);

		const timer = new RedisWorkerTimerClass(MOCK_TICK);
		timer.start();

		await Promise.resolve();
		jest.advanceTimersByTime(1000);

		expect(MOCK_TICK).toHaveBeenCalledTimes(2);
	});

	it("should stop the timer", () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_TICK.mockResolvedValue(undefined);

		const timer = new RedisWorkerTimerClass(MOCK_TICK);
		timer.start();
		timer.stop();

		expect(MOCK_TICK).toHaveBeenCalled();
	});

	it("should not call tick when shutting down", () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(true);

		const timer = new RedisWorkerTimerClass(MOCK_TICK);
		timer.start();

		expect(MOCK_TICK).not.toHaveBeenCalled();
	});

	it("should handle tick errors", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
		MOCK_TICK.mockRejectedValue(new Error("tick error"));
		const logger = jest.requireMock("../../src/config/logger") as {
			logger: { error: jest.Mock };
		};

		const timer = new RedisWorkerTimerClass(MOCK_TICK);
		timer.start();

		await Promise.resolve();

		expect(logger.logger.error).toHaveBeenCalledWith(
			"DLQ Redis queue worker error",
			{ error: "tick error" }
		);
	});

	it("should stop scheduling when shutting down after tick", async () => {
		MOCK_IS_SHUTTING_DOWN.mockReturnValueOnce(false).mockReturnValueOnce(true);
		MOCK_TICK.mockResolvedValue(undefined);

		const timer = new RedisWorkerTimerClass(MOCK_TICK);
		timer.start();

		await Promise.resolve();

		expect(MOCK_TICK).toHaveBeenCalledTimes(1);
	});
});
