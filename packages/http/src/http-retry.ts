import { computeExponentialBackoffWithJitter } from "@trading-model/common/utils/backoff-config";
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

function computeRetryDelay(attempt: number): DurationMs {
	return computeExponentialBackoffWithJitter(attempt, {
		baseDelayMs: DurationMs.of(200),
		maxDelayMs: DurationMs.of(5000),
	});
}

export {
	computeRetryDelay,
	DEFAULT_RETRY_COUNT,
	isRetryableStatus,
	isRetryableStatusPermissive,
};
