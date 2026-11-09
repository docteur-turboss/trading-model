import { describe, expect, it, jest } from "@jest/globals";
import { createAutoRetryScheduler } from "../../src/infrastructure/auto-retry-scheduler";

const MOCK_IS_SHUTTING_DOWN = jest.fn<() => boolean>();

jest.mock("../../src/config/logger", () => ({
	logger: {
		info: jest.fn<(...args: any[]) => any>(),
		warn: jest.fn<(...args: any[]) => any>(),
		error: jest.fn<(...args: any[]) => any>(),
	},
}));

jest.mock("../../src/shared/shutdown-flag", () => ({
	isShuttingDown: () => MOCK_IS_SHUTTING_DOWN(),
}));

function setup(enabled = true) {
	const tick = jest.fn<() => Promise<void>>(async () => undefined);
	const start = jest.fn<() => void>();
	const stop = jest.fn<() => void>();
	const scheduler = createAutoRetryScheduler({
		env: {
			DLQ_AUTO_RETRY_ENABLED: enabled,
			DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
		},
		tick,
		redisWorker: { start, stop },
	});
	return { scheduler, tick, start, stop };
}

describe("auto-retry-scheduler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
		MOCK_IS_SHUTTING_DOWN.mockReturnValue(false);
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("starts the Redis worker when enabled", () => {
		const t = setup();
		t.scheduler.start();
		expect(t.start).toHaveBeenCalled();
		t.scheduler.stop();
	});

	it("starts nothing when disabled", () => {
		const t = setup(false);
		t.scheduler.start();
		expect(t.start).not.toHaveBeenCalled();
	});

	it("stops the Redis worker", () => {
		const t = setup();
		t.scheduler.start();
		t.scheduler.stop();
		expect(t.stop).toHaveBeenCalled();
	});

	it("runs a tick after the jittered delay, even when a tick fails", async () => {
		const t = setup();
		t.tick.mockRejectedValueOnce(new Error("tick failed"));
		t.scheduler.start();

		// Worst case: initial jitter < 30 s, then 30 s + up to 3 s of jitter.
		await jest.advanceTimersByTimeAsync(30000 * 2.1);

		expect(t.tick).toHaveBeenCalled();
		t.scheduler.stop();
	});
});
