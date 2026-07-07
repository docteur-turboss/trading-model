import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "../utils/backoff-config";

const DEFAULT_RETRY_COUNT = 3;

function isRetryableStatus(code: number): boolean {
	return code >= 500 || code === 429;
}

function computeRetryDelay(attempt: number, options?: BackoffConfig): number {
	return computeExponentialBackoffWithJitter(attempt, {
		baseDelayMs: options?.baseDelayMs ?? 200,
		maxDelayMs: options?.maxDelayMs ?? 5_000,
		jitterMs: options?.jitterMs ?? 0,
	});
}

function computeAdaptiveTimeout(baseMs: number, ewmLatencyMs?: number): number {
	if (ewmLatencyMs !== undefined) {
		return Math.max(baseMs, Math.round(ewmLatencyMs * 3));
	}
	return baseMs * 2;
}

export {
	computeAdaptiveTimeout,
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isRetryableStatus,
};
