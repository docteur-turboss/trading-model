import type { PositiveInt } from "../domain/primitives";
import { DurationMs } from "../domain/primitives";
import { HTTP_STATUS } from "../http-status";
import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "../utils/backoff-config";

const DEFAULT_RETRY_COUNT = 3 as PositiveInt;

function isRetryableStatus(code: number): boolean {
	return (
		code >= HTTP_STATUS.INTERNAL_SERVER_ERROR ||
		code === HTTP_STATUS.TOO_MANY_REQUESTS
	);
}

/** More permissive check — also retries 403, 408, and 418 (used by financial-scraper). */
function isRetryableStatusPermissive(code: number): boolean {
	return (
		isRetryableStatus(code) ||
		[
			HTTP_STATUS.FORBIDDEN,
			HTTP_STATUS.REQUEST_TIMEOUT,
			HTTP_STATUS.IM_A_TEAPOT,
		].some((status) => status === code)
	);
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
