import { computeExponentialBackoff } from "../utils/backoff-config";

const DEFAULT_RETRY_COUNT = 3;
const RETRY_BASE_DELAY_MS = 200;
const RETRY_MAX_DELAY_MS = 5_000;

function isRetryableStatus(code: number): boolean {
	return code >= 500 || code === 429;
}

function computeRetryDelay(attempt: number): number {
	return computeExponentialBackoff(RETRY_BASE_DELAY_MS, attempt, RETRY_MAX_DELAY_MS);
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
