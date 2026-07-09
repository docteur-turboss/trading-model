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

export interface RetryResult<_TResult> {
	result: _TResult | null;
	lastError: Error | null;
	attempts: number;
	timedOut: boolean;
}

function _addJitter(delayMs: number, jitterMs: number): number {
	return jitterMs > 0 ? delayMs + Math.random() * jitterMs : delayMs;
}

export async function retryWithBackoff<_TResult>(
	fn: () => Promise<_TResult>,
	options: RetryOptions
): Promise<RetryResult<_TResult>> {
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

export function withTimeout<TResult>(
	promise: Promise<TResult>,
	timeoutMs: number,
	timeoutMessage = "Operation timed out"
): Promise<TResult> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
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
