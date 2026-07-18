import { describe, expect, it, jest } from "@jest/globals";

const MOCK_QUIT = jest.fn();
const MOCK_DISCONNECT = jest.fn();
const MOCK_CONNECT = jest.fn();
const MOCK_CALL = jest.fn();

jest.mock("ioredis", () => {
	return jest.fn(() => ({
		connect: MOCK_CONNECT,
		quit: MOCK_QUIT,
		disconnect: MOCK_DISCONNECT,
		call: MOCK_CALL,
		on: jest.fn(),
		status: "ready",
	}));
});

jest.mock("express-rate-limit", () => {
	return () => {
		const fn: Record<string, unknown> = (() => {}) as unknown as Record<
			string,
			unknown
		>;
		fn.resetKey = jest.fn();
		return fn as ReturnType<typeof import("express-rate-limit")>;
	};
});

jest.mock("rate-limit-redis", () => {
	return jest.fn();
});

jest.mock("../../src/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

describe("rate-limiter", () => {
	beforeEach(() => {
		jest.clearAllMocks();
		jest.resetModules();
	});

	it("should create rate limiters with env REDIS_URL set", () => {
		jest.doMock("../../src/config/env", () => ({
			ENV: {
				REDIS_URL: "redis://localhost:6379",
			},
		}));

		const rateLimiter = jest.requireActual("../../src/dlq/rate-limiter") as {
			_createReplayLimiter: () => unknown;
			_createWriteLimiter: () => unknown;
			_createHealthLimiter: () => unknown;
		};

		const replay = rateLimiter._createReplayLimiter();
		expect(replay).toBeDefined();

		const write = rateLimiter._createWriteLimiter();
		expect(write).toBeDefined();

		const health = rateLimiter._createHealthLimiter();
		expect(health).toBeDefined();
	});

	it("should close redis client", async () => {
		const rateLimiter = jest.requireActual("../../src/dlq/rate-limiter") as {
			closeRedisClient: () => Promise<void>;
		};

		MOCK_QUIT.mockResolvedValue(undefined);
		await rateLimiter.closeRedisClient();
		expect(MOCK_QUIT).not.toHaveBeenCalled();
	});

	it("should handle close redis client quit error", async () => {
		jest.doMock("../../src/config/env", () => ({
			ENV: {
				REDIS_URL: "redis://localhost:6379",
			},
		}));

		const rateLimiter = jest.requireActual("../../src/dlq/rate-limiter") as {
			_createReplayLimiter: () => unknown;
			closeRedisClient: () => Promise<void>;
		};

		rateLimiter._createReplayLimiter();

		MOCK_QUIT.mockRejectedValue(new Error("quit failed"));
		await rateLimiter.closeRedisClient();

		expect(MOCK_DISCONNECT).toHaveBeenCalled();
	});

	it("should close rate limiters", () => {
		const rateLimiter = jest.requireActual("../../src/dlq/rate-limiter") as {
			closeRateLimiters: () => void;
		};

		rateLimiter.closeRateLimiters();
	});

	it("should handle connect failure gracefully", () => {
		jest.doMock("../../src/config/env", () => ({
			ENV: {
				REDIS_URL: "redis://localhost:6379",
			},
		}));

		MOCK_CONNECT.mockRejectedValue(new Error("connect failed"));

		const rateLimiter = jest.requireActual("../../src/dlq/rate-limiter") as {
			_createReplayLimiter: () => unknown;
		};

		const replay = rateLimiter._createReplayLimiter();
		expect(replay).toBeDefined();
	});
});
