import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "../utils/backoff-config";

const DEFAULT_RETRY_COUNT = 3;

function isRetryableStatus(code: number): boolean {
	return code >= 500 || code === 429;
}

/** More permissive check — also retries 403, 408, and 418 (used by financial-scraper). */
function isRetryableStatusPermissive(code: number): boolean {
	return isRetryableStatus(code) || [403, 408, 418].includes(code);
}

/** Checks if a delivery status should NOT be retried (used by message-manager delivery-decision). */
function isNonRetryableClientError(code: number): boolean {
	return code >= 400 && code < 500 && code !== 429;
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
	isRetryableStatusPermissive,
	isNonRetryableClientError,
};
