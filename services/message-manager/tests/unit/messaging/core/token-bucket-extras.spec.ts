import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { TokenBucket } from "../../../../src/messaging/core/token-bucket";

describe("TokenBucket extras", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should refill tokens after intervals pass", () => {
		const bucket = new TokenBucket(100, 10, 1000);

		bucket.tryConsume(100);
		expect(bucket.tryConsume(1)).toBe(false);

		jest.advanceTimersByTime(2000);

		expect(bucket.tryConsume(20)).toBe(true);
	});
});
