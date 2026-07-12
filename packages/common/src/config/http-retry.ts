import { DurationMs } from "../domain/primitives";
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

function computeRetryDelay(
	attempt: number,
	options?: BackoffConfig
): DurationMs {
	return computeExponentialBackoffWithJitter(
		attempt,
		options ?? {
			baseDelayMs: DurationMs.of(200),
			maxDelayMs: DurationMs.of(5000),
		}
	);
}

function computeAdaptiveTimeout(
	baseMs: DurationMs,
	ewmLatencyMs?: DurationMs
): DurationMs {
	if (ewmLatencyMs !== undefined) {
		return DurationMs.of(Math.max(baseMs, Math.round(ewmLatencyMs * 3)));
	}
	return DurationMs.of(baseMs * 2);
}

export {
	computeAdaptiveTimeout,
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isNonRetryableClientError,
	isRetryableStatus,
	isRetryableStatusPermissive,
};
