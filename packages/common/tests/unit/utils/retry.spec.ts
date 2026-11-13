import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import { DurationMs } from "@trading-model/primitives/primitives";
import { retryWithBackoff, withTimeout } from "../../../src/utils/retry";

describe("retryWithBackoff", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should return result on first success", async () => {
		const fn = jest.fn<() => Promise<string>>().mockResolvedValue("ok");
		const promise = retryWithBackoff(fn, { maxRetries: 3 });

		await jest.advanceTimersByTimeAsync(1);
		const result = await promise;

		expect(result.result).toBe("ok");
		expect(result.attempts).toBe(1);
		expect(result.lastError).toBeNull();
	});

	it("should retry on failure and eventually succeed", async () => {
		const fn = jest
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error("fail1"))
			.mockRejectedValueOnce(new Error("fail2"))
			.mockResolvedValue("ok");

		const promise = retryWithBackoff(fn, {
			maxRetries: 3,
			baseDelayMs: DurationMs.of(10),
		});

		await jest.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(result.result).toBe("ok");
		expect(result.attempts).toBe(3);
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("should return last error after all retries exhausted", async () => {
		const error = new Error("persistent");
		const fn = jest.fn<() => Promise<string>>().mockRejectedValue(error);

		const promise = retryWithBackoff(fn, {
			maxRetries: 2,
			baseDelayMs: DurationMs.of(10),
		});

		await jest.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(result.result).toBeNull();
		expect(result.lastError).toBe(error);
		expect(result.attempts).toBe(2);
	});
});

describe("withTimeout", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should resolve if promise completes before timeout", async () => {
		const promise = Promise.resolve("ok");
		const result = await withTimeout(promise, DurationMs.of(1000));
		expect(result).toBe("ok");
	});

	it("should reject if promise takes too long", async () => {
		const slow = new Promise<string>(() => {});
		const promise = withTimeout(slow, DurationMs.of(100));
		jest.advanceTimersByTime(200);
		await expect(promise).rejects.toThrow("Operation timed out");
	});

	it("should use custom timeout message", async () => {
		const slow = new Promise<string>(() => {});
		const promise = withTimeout(slow, DurationMs.of(100), "Custom timeout");
		jest.advanceTimersByTime(200);
		await expect(promise).rejects.toThrow("Custom timeout");
	});
});
