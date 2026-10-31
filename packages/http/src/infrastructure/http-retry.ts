import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "@trading-model/common/utils/backoff-config";
import { HTTP_STATUS } from "@trading-model/contracts/http-status";
import type { PositiveInt } from "@trading-model/primitives/primitives";
import { DurationMs } from "@trading-model/primitives/primitives";

const DEFAULT_RETRY_COUNT = 3 as PositiveInt;

function isRetryableStatus(code: number): boolean {
	return (
		code >= HTTP_STATUS.INTERNAL_SERVER_ERROR ||
		code === HTTP_STATUS.TOO_MANY_REQUESTS
	);
}

/**
 * More permissive check — also retries 408 (used by financial-scraper).
 * Never 403 or 418: Binance answers 403 on a WAF violation and 418 on an IP
 * ban, and retrying either one extends the ban (ADR-0026).
 */
function isRetryableStatusPermissive(code: number): boolean {
	return isRetryableStatus(code) || code === HTTP_STATUS.REQUEST_TIMEOUT;
}

/** Checks if a delivery status should NOT be retried (used by message-manager delivery-decision). */
function isNonRetryableClientError(code: number): boolean {
	return (
		code >= HTTP_STATUS.BAD_REQUEST &&
		code < HTTP_STATUS.INTERNAL_SERVER_ERROR &&
		code !== HTTP_STATUS.TOO_MANY_REQUESTS
	);
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
