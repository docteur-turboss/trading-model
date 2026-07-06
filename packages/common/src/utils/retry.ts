import {
	type BackoffConfig,
	computeExponentialBackoff,
} from "./backoff-config";
import { sleep } from "./sleep";

export interface RetryOptions extends BackoffConfig {
	maxRetries: number;
	timeoutMs?: number;
	/** Optional jitter in ms to add to each backoff delay. */
	jitterMs?: number;
	/** Optional callback to check whether retries should continue. If returns false, the loop aborts. */
	shouldRetry?: () => boolean;
}

export interface RetryResult<T> {
	result: T | null;
	lastError: Error | null;
	attempts: number;
	timedOut: boolean;
}

function _addJitter(delayMs: number, jitterMs: number): number {
	return jitterMs > 0 ? delayMs + Math.random() * jitterMs : delayMs;
}

export async function retryWithBackoff<T>(
	fn: () => Promise<T>,
	options: RetryOptions
): Promise<RetryResult<T>> {
	const {
		maxRetries,
		baseDelayMs = 100,
		maxDelayMs = 5000,
		timeoutMs = 0,
		jitterMs = 0,
		shouldRetry,
	} = options;
	const start = Date.now();
	let lastError: Error | null = null;
	let attempt = 0;

	while (attempt < maxRetries) {
		if (shouldRetry && !shouldRetry()) {
			return { result: null, lastError, attempts: attempt, timedOut: false };
		}
		if (timeoutMs > 0 && Date.now() - start > timeoutMs) {
			return { result: null, lastError, attempts: attempt, timedOut: true };
		}
		try {
			const result = await fn();
			return {
				result,
				lastError: null,
				attempts: attempt + 1,
				timedOut: false,
			};
		} catch (err) {
			attempt++;
			lastError = err as Error;
			if (attempt < maxRetries) {
				const delay = computeExponentialBackoff(attempt, {
					baseDelayMs,
					maxDelayMs,
				});
				await sleep(_addJitter(delay, jitterMs));
			}
		}
	}
	return { result: null, lastError, attempts: attempt, timedOut: false };
}

export function withTimeout<T>(
	promise: Promise<T>,
	timeoutMs: number,
	timeoutMessage = "Operation timed out"
): Promise<T> {
	return Promise.race([
		promise,
		new Promise<T>((_, reject) => {
			const timer = setTimeout(
				() => reject(new Error(timeoutMessage)),
				timeoutMs
			);
			timer.unref();
		}),
	]);
}

export function sleepWithJitter(ms: number): Promise<void> {
	const jitter = ms * 0.2 * (Math.random() * 2 - 1);
	return sleep(Math.max(1, Math.round(ms + jitter)));
}
