import { describe, expect, it } from "@jest/globals";
import {
	computeAdaptiveTimeout,
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isNonRetryableClientError,
	isRetryableStatus,
	isRetryableStatusPermissive,
} from "../../../src/config/http-retry";

describe("isRetryableStatus", () => {
	it("should return true for 5xx status codes", () => {
		expect(isRetryableStatus(500)).toBe(true);
		expect(isRetryableStatus(502)).toBe(true);
		expect(isRetryableStatus(503)).toBe(true);
	});

	it("should return true for 429", () => {
		expect(isRetryableStatus(429)).toBe(true);
	});

	it("should return false for 4xx non-retryable", () => {
		expect(isRetryableStatus(400)).toBe(false);
		expect(isRetryableStatus(404)).toBe(false);
		expect(isRetryableStatus(403)).toBe(false);
	});

	it("should return false for 2xx", () => {
		expect(isRetryableStatus(200)).toBe(false);
	});
});

describe("isRetryableStatusPermissive", () => {
	it("should return true for 5xx status codes", () => {
		expect(isRetryableStatusPermissive(500)).toBe(true);
	});

	it("should return true for 429", () => {
		expect(isRetryableStatusPermissive(429)).toBe(true);
	});

	it("should return true for 403, 408, 418", () => {
		expect(isRetryableStatusPermissive(403)).toBe(true);
		expect(isRetryableStatusPermissive(408)).toBe(true);
		expect(isRetryableStatusPermissive(418)).toBe(true);
	});

	it("should return false for other 4xx", () => {
		expect(isRetryableStatusPermissive(400)).toBe(false);
		expect(isRetryableStatusPermissive(404)).toBe(false);
	});
});

describe("isNonRetryableClientError", () => {
	it("should return true for 4xx except 429", () => {
		expect(isNonRetryableClientError(400)).toBe(true);
		expect(isNonRetryableClientError(404)).toBe(true);
		expect(isNonRetryableClientError(403)).toBe(true);
	});

	it("should return false for 429", () => {
		expect(isNonRetryableClientError(429)).toBe(false);
	});

	it("should return false for 5xx", () => {
		expect(isNonRetryableClientError(500)).toBe(false);
		expect(isNonRetryableClientError(503)).toBe(false);
	});

	it("should return false for 2xx", () => {
		expect(isNonRetryableClientError(200)).toBe(false);
	});
});

describe("computeRetryDelay", () => {
	it("should return a delay value", () => {
		const delay = computeRetryDelay(1);
		expect(delay).toBeGreaterThanOrEqual(0);
	});

	it("should respect custom options", () => {
		const delay = computeRetryDelay(1, { baseDelayMs: 500, maxDelayMs: 10000 });
		expect(delay).toBeGreaterThanOrEqual(0);
		expect(delay).toBeLessThanOrEqual(10000);
	});
});

describe("computeAdaptiveTimeout", () => {
	it("should return baseMs * 2 when no ewmLatencyMs", () => {
		expect(computeAdaptiveTimeout(5000)).toBe(10000);
	});

	it("should return max of baseMs and ewmLatencyMs * 3", () => {
		expect(computeAdaptiveTimeout(5000, 1000)).toBe(5000);
		expect(computeAdaptiveTimeout(2000, 1000)).toBe(3000);
	});
});

describe("DEFAULT_RETRY_COUNT", () => {
	it("should be 3", () => {
		expect(DEFAULT_RETRY_COUNT).toBe(3);
	});
});
