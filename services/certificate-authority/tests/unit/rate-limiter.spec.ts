import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("@trading-model/common/config/logger", () => ({
	logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ClientIdentity } from "@trading-model/common/domain/primitives/auth-ids";
import {
	checkSignRequestRateLimit,
	checkUnauthRateLimit,
	clearRateLimiterKey,
} from "../../src/app/rate-limiter";

let keyCounter = 0;
function uniqueKey(): string {
	return `client-${++keyCounter}`;
}

describe("rate-limiter", () => {
	beforeEach(() => {
		jest.clearAllMocks();
	});

	describe("checkUnauthRateLimit", () => {
		it("should allow first request", () => {
			const identity = ClientIdentity.of(uniqueKey());
			expect(checkUnauthRateLimit(identity)).toBe(true);
		});

		it("should allow up to 3 requests within window", () => {
			const identity = ClientIdentity.of(uniqueKey());
			expect(checkUnauthRateLimit(identity)).toBe(true);
			expect(checkUnauthRateLimit(identity)).toBe(true);
			expect(checkUnauthRateLimit(identity)).toBe(true);
		});

		it("should block after 3 requests within window", () => {
			const identity = ClientIdentity.of(uniqueKey());
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);
			const result = checkUnauthRateLimit(identity);
			expect(result).toBe(false);
		});

		it("should reset entry after ban period", () => {
			jest.useFakeTimers();
			const identity = ClientIdentity.of(uniqueKey());
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);
			expect(checkUnauthRateLimit(identity)).toBe(false);

			jest.advanceTimersByTime(360_000);
			expect(checkUnauthRateLimit(identity)).toBe(true);
			jest.useRealTimers();
		});

		it("should treat different clients independently", () => {
			const c1 = ClientIdentity.of(uniqueKey());
			const c2 = ClientIdentity.of(uniqueKey());
			expect(checkUnauthRateLimit(c1)).toBe(true);
			expect(checkUnauthRateLimit(c1)).toBe(true);
			expect(checkUnauthRateLimit(c1)).toBe(true);
			expect(checkUnauthRateLimit(c1)).toBe(false);
			expect(checkUnauthRateLimit(c2)).toBe(true);
		});

		it("should reset entry when window has passed", () => {
			jest.useFakeTimers();
			const identity = ClientIdentity.of(uniqueKey());
			checkUnauthRateLimit(identity);
			jest.advanceTimersByTime(61_000);
			expect(checkUnauthRateLimit(identity)).toBe(true);
			jest.useRealTimers();
		});
	});

	describe("checkSignRequestRateLimit", () => {
		function makeState(overrides: any = {}) {
			return {
				tokenProvided: false,
				bootstrapToken: undefined,
				authAttempts: 0,
				requestCount: 0,
				requestWindowStart: Date.now(),
				...overrides,
			};
		}

		it("should allow authenticated request", () => {
			const state = makeState({ tokenProvided: true });
			const result = checkSignRequestRateLimit(
				state,
				"client-1" as any,
				"limiter-key-1"
			);
			expect(result).toBe(true);
		});

		it("should allow unauthenticated request within rate limit", () => {
			const state = makeState({ tokenProvided: false });
			const result = checkSignRequestRateLimit(
				state,
				"client-1" as any,
				uniqueKey()
			);
			expect(result).toBe(true);
		});

		it("should block when unauthenticated rate limit exceeded", () => {
			const limiterKey = uniqueKey();
			const identity = ClientIdentity.of(limiterKey);
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);
			checkUnauthRateLimit(identity);

			const state = makeState({ tokenProvided: false });
			const result = checkSignRequestRateLimit(
				state,
				"blocked-client" as any,
				limiterKey
			);
			expect(result).toBe(false);
		});

		it("should block when connection rate limit exceeded", () => {
			const state = makeState({
				tokenProvided: true,
				requestCount: 101,
				requestWindowStart: Date.now(),
			});
			const result = checkSignRequestRateLimit(
				state,
				"client-1" as any,
				"key-1"
			);
			expect(result).toBe(false);
		});

		it("should reset connection window after AUTH_RATE_LIMIT_MS", () => {
			jest.useFakeTimers();
			const state = makeState({
				tokenProvided: true,
				requestCount: 101,
				requestWindowStart: Date.now() - 120_000,
			});
			const result = checkSignRequestRateLimit(
				state,
				"client-1" as any,
				"key-1"
			);
			expect(result).toBe(true);
			expect(state.requestCount).toBe(1);
			jest.useRealTimers();
		});

		it("should increment request count on each call", () => {
			const state = makeState({ tokenProvided: true, requestCount: 5 });
			checkSignRequestRateLimit(state, "client-1" as any, "key-1");
			expect(state.requestCount).toBe(6);
		});
	});

	describe("clearRateLimiterKey", () => {
		it("should remove key from rate limiter map", () => {
			const key = uniqueKey();
			const identity = ClientIdentity.of(key);
			expect(checkUnauthRateLimit(identity)).toBe(true);
			expect(checkUnauthRateLimit(identity)).toBe(true);
			clearRateLimiterKey(key);
			expect(checkUnauthRateLimit(identity)).toBe(true);
		});

		it("should not throw when key does not exist", () => {
			expect(() => clearRateLimiterKey("non-existent")).not.toThrow();
		});
	});
});
