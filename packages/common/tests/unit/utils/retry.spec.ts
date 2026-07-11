import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	jest,
} from "@jest/globals";
import {
	retryWithBackoff,
	sleepWithJitter,
	withTimeout,
} from "../../../src/utils/retry";

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
		expect(result.timedOut).toBe(false);
	});

	it("should retry on failure and eventually succeed", async () => {
		const fn = jest
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(new Error("fail1"))
			.mockRejectedValueOnce(new Error("fail2"))
			.mockResolvedValue("ok");

		const promise = retryWithBackoff(fn, { maxRetries: 3, baseDelayMs: 10 });

		await jest.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(result.result).toBe("ok");
		expect(result.attempts).toBe(3);
		expect(fn).toHaveBeenCalledTimes(3);
	});

	it("should return last error after all retries exhausted", async () => {
		const error = new Error("persistent");
		const fn = jest.fn<() => Promise<string>>().mockRejectedValue(error);

		const promise = retryWithBackoff(fn, { maxRetries: 2, baseDelayMs: 10 });

		await jest.advanceTimersByTimeAsync(1000);
		const result = await promise;

		expect(result.result).toBeNull();
		expect(result.lastError).toBe(error);
		expect(result.attempts).toBe(2);
	});

	it("should abort when shouldRetry returns false", async () => {
		const fn = jest
			.fn<() => Promise<string>>()
			.mockRejectedValue(new Error("fail"));

		const promise = retryWithBackoff(fn, {
			maxRetries: 5,
			baseDelayMs: 10,
			shouldRetry: () => false,
		});

		await jest.advanceTimersByTimeAsync(100);
		const result = await promise;

		expect(result.attempts).toBe(0);
		expect(fn).not.toHaveBeenCalled();
	});

	it("should timeout when timeoutMs is exceeded", async () => {
		const fn = jest
			.fn<() => Promise<string>>()
			.mockRejectedValue(new Error("slow"));

		const promise = retryWithBackoff(fn, {
			maxRetries: 10,
			baseDelayMs: 500,
			timeoutMs: 100 as never,
		});

		await jest.advanceTimersByTimeAsync(10000);
		const result = await promise;

		expect(result.timedOut).toBe(true);
	});
});

describe("sleepWithJitter", () => {
	beforeEach(() => {
		jest.useFakeTimers();
	});

	afterEach(() => {
		jest.useRealTimers();
	});

	it("should resolve after the given time with jitter", async () => {
		const promise = sleepWithJitter(100);
		await jest.advanceTimersByTimeAsync(200);
		await expect(promise).resolves.toBeUndefined();
	});

	it("should handle zero ms with jitter", async () => {
		const promise = sleepWithJitter(0);
		await jest.advanceTimersByTimeAsync(10);
		await expect(promise).resolves.toBeUndefined();
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
		const result = await withTimeout(promise, 1000);
		expect(result).toBe("ok");
	});

	it("should reject if promise takes too long", async () => {
		const slow = new Promise<string>(() => {});
		const promise = withTimeout(slow, 100);
		jest.advanceTimersByTime(200);
		await expect(promise).rejects.toThrow("Operation timed out");
	});

	it("should use custom timeout message", async () => {
		const slow = new Promise<string>(() => {});
		const promise = withTimeout(slow, 100, "Custom timeout");
		jest.advanceTimersByTime(200);
		await expect(promise).rejects.toThrow("Custom timeout");
	});
});
