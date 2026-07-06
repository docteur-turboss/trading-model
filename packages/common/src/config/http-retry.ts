import { computeExponentialBackoff, type BackoffConfig } from "../utils/backoff-config";

const DEFAULT_RETRY_COUNT = 3;

function isRetryableStatus(code: number): boolean {
	return code >= 500 || code === 429;
}

function computeRetryDelay(attempt: number, options?: BackoffConfig): number {
	const baseDelayMs = options?.baseDelayMs ?? 200;
	const maxDelayMs = options?.maxDelayMs ?? 5_000;
	const delay = computeExponentialBackoff(attempt, { baseDelayMs, maxDelayMs });
	if (options?.jitterMs && options.jitterMs > 0) {
		return delay + Math.random() * options.jitterMs;
	}
	return delay;
}

function computeAdaptiveTimeout(
	baseMs: number,
	ewmLatencyMs?: number
): number {
	if (ewmLatencyMs !== undefined) {
		return Math.max(baseMs, Math.round(ewmLatencyMs * 3));
	}
	return baseMs * 2;
}

export { DEFAULT_RETRY_COUNT, computeAdaptiveTimeout, computeRetryDelay, isRetryableStatus };
