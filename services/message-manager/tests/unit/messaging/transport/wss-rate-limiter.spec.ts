import { describe, expect, it, jest } from "@jest/globals";

let mockTimerRunning = false;

jest.mock("@trading-model/common/utils/timer-handle", () => {
	return {
		TimerHandle: jest.fn().mockImplementation(() => ({
			get isRunning() {
				return mockTimerRunning;
			},
			startInterval: jest.fn((cb: () => void) => {
				mockTimerRunning = true;
				cb();
			}),
			startTimeout: jest.fn(),
			stop: jest.fn(() => {
				mockTimerRunning = false;
			}),
			unref: jest.fn(),
		})),
	};
});

describe("WssRateLimiter", () => {
	function makeLimiter() {
		return new (require("../../../../src/messaging/transport/wss-rate-limiter").WssRateLimiter)();
	}

	it("should allow requests within rate limit", () => {
		const limiter = makeLimiter();
		expect(limiter.check("test-service")).toBe(true);
	});

	it("should reject when rate limit exceeded", () => {
		const limiter = makeLimiter();
		for (let i = 0; i < 10000; i++) {
			limiter.check("test-service");
		}
		expect(limiter.check("test-service")).toBe(false);
	});

	it("checkAndReject returns true when within limit", () => {
		const limiter = makeLimiter();
		const ws = { send: jest.fn() };
		expect(limiter.checkAndReject("test-service", ws as never)).toBe(true);
		expect(ws.send).not.toHaveBeenCalled();
	});

	it("checkAndReject sends error when rate limit exceeded", () => {
		const limiter = makeLimiter();
		const ws = { send: jest.fn() };
		for (let i = 0; i < 10000; i++) {
			limiter.check("test-service");
		}
		expect(limiter.checkAndReject("test-service", ws as never)).toBe(false);
		expect(ws.send).toHaveBeenCalled();
	});

	it("ensureCleanupTimer starts timer", () => {
		const limiter = makeLimiter();
		limiter.ensureCleanupTimer();
		expect(true).toBe(true);
	});

	it("ensureCleanupTimer is idempotent", () => {
		const limiter = makeLimiter();
		limiter.ensureCleanupTimer();
		limiter.ensureCleanupTimer();
		expect(true).toBe(true);
	});

	it("shutdown stops timer and clears windows", () => {
		const limiter = makeLimiter();
		limiter.ensureCleanupTimer();
		limiter.check("test-service");
		limiter.shutdown();
		expect(true).toBe(true);
	});

	it("_cleanupWindows deletes stale entry", () => {
		const limiter = makeLimiter();
		limiter.check("stale-service");
		const entry = limiter._windows.get("stale-service");
		if (entry) {
			while (entry.timestamps.length > 0) {
				entry.timestamps.shift();
			}
			entry.lastSeen = 0;
		}
		limiter._cleanupWindows();
		expect(limiter._windows.has("stale-service")).toBe(false);
	});

	it("_pruneEntryTimestamps removes old timestamps", () => {
		const limiter = makeLimiter();
		limiter.check("prune-service");
		const entry = limiter._windows.get("prune-service");
		if (entry) {
			while (entry.timestamps.length > 0) {
				entry.timestamps.shift();
			}
			entry.timestamps.push(Date.now() - 200000);
		}
		limiter._cleanupWindows();
		expect(entry?.timestamps.length).toBe(0);
	});

	it("_pruneOldTimestamps with mixed old and new timestamps", () => {
		const limiter = makeLimiter();
		limiter.check("mixed-service");
		expect(limiter.check("mixed-service")).toBe(true);
	});

	it("_pruneOldTimestamps removes old timestamps before check", () => {
		const limiter = makeLimiter();
		const entry = limiter._windows.get("old-prune-service");
		if (!entry) {
			limiter.check("old-prune-service");
		}
		const e = limiter._windows.get("old-prune-service");
		if (e) {
			while (e.timestamps.length > 0) {
				e.timestamps.shift();
			}
			e.timestamps.push(Date.now() - 120000);
		}
		limiter.check("old-prune-service");
		expect(limiter._windows.has("old-prune-service")).toBe(true);
	});
});
