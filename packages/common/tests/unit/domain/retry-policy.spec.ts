import { describe, expect, it } from "@jest/globals";
import { RetryPolicy } from "../../../src/domain/retry-policy";

describe("RetryPolicy", () => {
	it("should be exceeded when retryCount reaches maxRetries", () => {
		expect(
			RetryPolicy.hasExceededMaxRetries({ retryCount: 3, maxRetries: 3 })
		).toBe(true);
		expect(
			RetryPolicy.hasExceededMaxRetries({ retryCount: 5, maxRetries: 3 })
		).toBe(true);
	});

	it("should not be exceeded below maxRetries", () => {
		expect(
			RetryPolicy.hasExceededMaxRetries({ retryCount: 2, maxRetries: 3 })
		).toBe(false);
	});
});
