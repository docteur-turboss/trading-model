import { DurationMs } from "@trading-model/primitives/primitives";
import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "./backoff-config";
import { normalizeError } from "./errors/base";
import { sleep } from "./sleep";

export interface RetryOptions extends BackoffConfig {
	maxRetries: number;
}

export interface RetryResult<_TResult> {
	result: _TResult | null;
	lastError: Error | null;
	attempts: number;
}

async function _attemptOnce<TResult>(
	fn: () => Promise<TResult>
): Promise<{ ok: true; result: TResult } | { ok: false; error: Error }> {
	try {
		return { ok: true, result: await fn() };
	} catch (err) {
		return { ok: false, error: normalizeError(err) };
	}
}

async function _sleepBackoff(
	attempt: number,
	config: BackoffConfig
): Promise<void> {
	await sleep(computeExponentialBackoffWithJitter(attempt, config));
}

export async function retryWithBackoff<_TResult>(
	fn: () => Promise<_TResult>,
	options: RetryOptions
): Promise<RetryResult<_TResult>> {
	const {
		maxRetries,
		baseDelayMs = DurationMs.of(100),
		maxDelayMs = DurationMs.of(5000),
		jitterMs = DurationMs.of(0),
	} = options;
	let lastError: Error | null = null;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		const outcome = await _attemptOnce(fn);
		if (outcome.ok) {
			return {
				result: outcome.result,
				lastError: null,
				attempts: attempt + 1,
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
	return { result: null, lastError, attempts: maxRetries };
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
