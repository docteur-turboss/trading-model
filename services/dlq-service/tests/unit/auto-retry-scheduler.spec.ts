import { describe, expect, it, jest } from "@jest/globals";
import { createAutoRetryScheduler } from "../../src/infrastructure/auto-retry-scheduler";
import { FakeLogger, FakeShutdown } from "../support/fakes";

function setup(enabled = true) {
	const tick = jest.fn<() => Promise<void>>(async () => undefined);
	const start = jest.fn<() => void>();
	const stop = jest.fn<() => void>();
	const logger = new FakeLogger();
	const shutdown = new FakeShutdown();
	const scheduler = createAutoRetryScheduler({
		logger,
		isShuttingDown: shutdown.probe,
		env: {
			DLQ_AUTO_RETRY_ENABLED: enabled,
			DLQ_AUTO_RETRY_INTERVAL_MS: 30000,
		},
		tick,
		redisWorker: { start, stop },
	});
	return { scheduler, tick, start, stop, logger, shutdown };
}

describe("auto-retry-scheduler", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.restoreAllMocks();
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
		// Pin the jitter: random 0 => initial delay 0, then 30 s - 3 s.
		jest.spyOn(Math, "random").mockReturnValue(0);
		const t = setup();
		t.tick.mockRejectedValueOnce(new Error("tick failed"));
		t.scheduler.start();

		await jest.advanceTimersByTimeAsync(30000);

		expect(t.tick).toHaveBeenCalled();
		expect(t.logger.messages("error")).toContain("DLQ auto-retry tick failed");
		t.scheduler.stop();
	});
});
