import { sleep } from "./sleep";
import type { BackoffConfig } from "./backoff-config";

export interface RetryOptions extends BackoffConfig {
	maxRetries: number;
	timeoutMs?: number;
}

export interface RetryResult<T> {
	result: T | null;
	lastError: Error | null;
	attempts: number;
	timedOut: boolean;
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
	} = options;
	const start = Date.now();
	let lastError: Error | null = null;
	let attempt = 0;

	while (attempt < maxRetries) {
		if (timeoutMs > 0 && Date.now() - start > timeoutMs) {
			return { result: null, lastError, attempts: attempt, timedOut: true };
		}
		try {
			const result = await fn();
			return { result, lastError: null, attempts: attempt + 1, timedOut: false };
		} catch (err) {
			attempt++;
			lastError = err as Error;
			if (attempt < maxRetries) {
				const backoff = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
				await sleep(backoff);
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
			const timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
			timer.unref();
		}),
	]);
}

export function sleepWithJitter(ms: number): Promise<void> {
	const jitter = ms * 0.2 * (Math.random() * 2 - 1);
	return sleep(Math.max(1, Math.round(ms + jitter)));
}
