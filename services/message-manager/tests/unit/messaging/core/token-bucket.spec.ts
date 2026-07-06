import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	TokenBucket,
	type TokenBucketConfig,
} from "../../../../src/messaging/core/token-bucket";

function createBucket(overrides: Partial<TokenBucketConfig> = {}): TokenBucket {
	return new TokenBucket({
		capacity: 100,
		refillRate: 10,
		refillIntervalMs: 1000,
		...overrides,
	});
}

describe("TokenBucket", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should initialize with full capacity", () => {
		const bucket = createBucket();
		expect(bucket.getAvailable()).toBe(100);
		expect(bucket.getCapacity()).toBe(100);
	});

	it("should allow consuming tokens when available", () => {
		const bucket = createBucket({ capacity: 10, refillRate: 5 });
		expect(bucket.tryConsume(3)).toBe(true);
		expect(bucket.getAvailable()).toBe(7);
	});

	it("should reject consuming when insufficient tokens", () => {
		const bucket = createBucket({ capacity: 5, refillRate: 5 });
		expect(bucket.tryConsume(10)).toBe(false);
	});

	it("should refill tokens after interval", () => {
		const bucket = createBucket({ capacity: 10, refillRate: 5 });
		bucket.tryConsume(10);
		expect(bucket.getAvailable()).toBe(0);

		jest.advanceTimersByTime(2000);
		expect(bucket.getAvailable()).toBe(10);
	});

	it("should not exceed capacity on refill", () => {
		const bucket = createBucket({ capacity: 10, refillRate: 5 });
		jest.advanceTimersByTime(5000);
		expect(bucket.getAvailable()).toBe(10);
	});

	it("should track usage ratio via callback", () => {
		const cb = jest.fn();
		const bucket = new TokenBucket(
			{ capacity: 100, refillRate: 10, refillIntervalMs: 1000 },
			cb
		);

		bucket.tryConsume(50);
		expect(cb).toHaveBeenCalledWith(0.5);

		bucket.tryConsume(50);
		expect(cb).toHaveBeenCalledWith(1);
	});

	it("should report getUsage correctly", () => {
		const bucket = createBucket();
		expect(bucket.getUsage()).toBe(0);

		bucket.tryConsume(30);
		expect(bucket.getUsage()).toBeCloseTo(0.3);

		bucket.tryConsume(70);
		expect(bucket.getUsage()).toBe(1);
	});

	it("should handle multiple refill intervals", () => {
		const bucket = createBucket();
		bucket.tryConsume(100);
		expect(bucket.getAvailable()).toBe(0);

		jest.advanceTimersByTime(3000);
		expect(bucket.getAvailable()).toBe(30);
	});

	it("should consume default count of 1 when not specified", () => {
		const bucket = createBucket({ capacity: 5, refillRate: 5 });
		expect(bucket.tryConsume()).toBe(true);
		expect(bucket.getAvailable()).toBe(4);
	});
});
