import { DurationMs } from "../domain/primitives";
import {
	type BackoffConfig,
	computeExponentialBackoff,
} from "./backoff-config";
import { sleep } from "./sleep";

export interface RetryOptions extends BackoffConfig {
	maxRetries: number;
	timeoutMs?: DurationMs;
	/** Optional callback to check whether retries should continue. If returns false, the loop aborts. */
	shouldRetry?: () => boolean;
}

export interface RetryResult<_TResult> {
	result: _TResult | null;
	lastError: Error | null;
	attempts: number;
	timedOut: boolean;
}

function _addJitter(delayMs: DurationMs, jitterMs: DurationMs): DurationMs {
	return jitterMs > 0
		? DurationMs.of(delayMs + Math.random() * jitterMs)
		: delayMs;
}

function _hasTimedOut(start: number, timeoutMs: DurationMs): boolean {
	return timeoutMs > 0 && Date.now() - start > timeoutMs;
}

async function _attemptOnce<TResult>(
	fn: () => Promise<TResult>
): Promise<{ ok: true; result: TResult } | { ok: false; error: Error }> {
	try {
		return { ok: true, result: await fn() };
	} catch (err) {
		return { ok: false, error: err as Error };
	}
}

async function _sleepBackoff(
	attempt: number,
	config: BackoffConfig
): Promise<void> {
	const delay = computeExponentialBackoff(attempt, config);
	await sleep(_addJitter(delay, config.jitterMs ?? DurationMs.of(0)));
}

export async function retryWithBackoff<_TResult>(
	fn: () => Promise<_TResult>,
	options: RetryOptions
): Promise<RetryResult<_TResult>> {
	const {
		maxRetries,
		baseDelayMs = DurationMs.of(100),
		maxDelayMs = DurationMs.of(5000),
		timeoutMs = DurationMs.zero(),
		jitterMs = DurationMs.of(0),
		shouldRetry,
	} = options;
	const start = Date.now();
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		if (shouldRetry && !shouldRetry()) {
			return { result: null, lastError, attempts: attempt, timedOut: false };
		}
		if (_hasTimedOut(start, timeoutMs)) {
			return { result: null, lastError, attempts: attempt, timedOut: true };
		}
		const outcome = await _attemptOnce(fn);
		if (outcome.ok) {
			return {
				result: outcome.result,
				lastError: null,
				attempts: attempt + 1,
				timedOut: false,
			};
		}
		lastError = outcome.error;
		if (attempt + 1 < maxRetries) {
			await _sleepBackoff(attempt + 1, {
				baseDelayMs,
				maxDelayMs,
				jitterMs,
			});
		}
	}
	return { result: null, lastError, attempts: maxRetries, timedOut: false };
}

export function withTimeout<TResult>(
	promise: Promise<TResult>,
	timeoutMs: DurationMs,
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

export function sleepWithJitter(ms: DurationMs): Promise<void> {
	const jitter = ms * 0.2 * (Math.random() * 2 - 1);
	return sleep(Math.max(1, Math.round(ms + jitter)));
}
