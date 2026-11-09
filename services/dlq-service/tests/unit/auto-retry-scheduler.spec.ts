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
		expect(t.logger.messages("error")).toContain("DLQ auto-retry tick failed");
		t.scheduler.stop();
	});
});
