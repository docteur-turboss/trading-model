import { describe, expect, it } from "@jest/globals";
import {
	computeExponentialBackoff,
	computeExponentialBackoffWithJitter,
	createDelayRange,
} from "../../../src/utils/backoff-config";

describe("backoff-config", () => {
	it("should compute exponential backoff", () => {
		const delay = computeExponentialBackoff(1, {
			baseDelayMs: 100,
			maxDelayMs: 10000,
		});
		expect(delay).toBeGreaterThanOrEqual(100);
		expect(delay).toBeLessThanOrEqual(10000);
	});

	it("should compute backoff with jitter", () => {
		const delay = computeExponentialBackoffWithJitter(1, {
			baseDelayMs: 100,
			maxDelayMs: 10000,
			jitterMs: 50,
		});
		expect(delay).toBeGreaterThanOrEqual(0);
		expect(delay).toBeLessThanOrEqual(10000);
	});

	it("should create delay range", () => {
		const range = createDelayRange(100, 10000);
		expect(range).toBeDefined();
	});
});
