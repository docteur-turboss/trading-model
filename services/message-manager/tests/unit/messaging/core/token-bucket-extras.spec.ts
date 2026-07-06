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

describe("TokenBucket extras", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should refill tokens after intervals pass", () => {
		const bucket = createBucket();

		bucket.tryConsume(100);
		expect(bucket.tryConsume(1)).toBe(false);

		jest.advanceTimersByTime(2000);

		expect(bucket.tryConsume(20)).toBe(true);
	});
});
