import { describe, expect, it, jest } from "@jest/globals";
import {
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isNonRetryableClientError,
	isRetryableStatus,
	isRetryableStatusPermissive,
	RETRY_JITTER_MS,
} from "@trading-model/http/infrastructure/http-retry";
import { DurationMs } from "@trading-model/primitives/primitives";

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

	it("should return true for 408", () => {
		expect(isRetryableStatusPermissive(408)).toBe(true);
	});

	it("should return false for 403 and 418 (Binance WAF violation and IP ban)", () => {
		expect(isRetryableStatusPermissive(403)).toBe(false);
		expect(isRetryableStatusPermissive(418)).toBe(false);
	});

	it("should return false for 451 (restricted location)", () => {
		expect(isRetryableStatusPermissive(451)).toBe(false);
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

	it("should add jitter by default", () => {
		const random = jest.spyOn(Math, "random").mockReturnValue(0.5);
		expect(computeRetryDelay(1)).toBe(400 + RETRY_JITTER_MS / 2);
		random.mockRestore();
	});

	it("should respect custom options", () => {
		const delay = computeRetryDelay(1, {
			baseDelayMs: DurationMs.of(500),
			maxDelayMs: DurationMs.of(10000),
		});
		expect(delay).toBeGreaterThanOrEqual(0);
		expect(delay).toBeLessThanOrEqual(10000);
	});
});

describe("DEFAULT_RETRY_COUNT", () => {
	it("should be 3", () => {
		expect(DEFAULT_RETRY_COUNT).toBe(3);
	});
});
