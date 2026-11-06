import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import {
	DurationMs,
	type SequenceNumber,
} from "@trading-model/primitives/primitives";

const BaseDelayMs = DurationMs.of(1000);
const MaxDelayMs = DurationMs.of(20_000);
const JitterFactor = 0.2;

export function backoffDelay(deliveryAttempt: SequenceNumber): number {
	const delay = computeExponentialBackoff(deliveryAttempt, {
		baseDelayMs: BaseDelayMs,
		maxDelayMs: MaxDelayMs,
	});
	const jitter = delay * JitterFactor * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(delay + jitter));
}

/** One delivery attempt lasts at most this long (the HTTP client does not retry underneath). */
export const DELIVERY_ATTEMPT_TIMEOUT_MS = DurationMs.of(10_000);

/**
 * Idle time of a journal entry before the next attempt may start: the previous
 * attempt has timed out (so no replica still works on it) and the backoff of
 * that attempt has passed.
 */
export function retryDueMs(deliveries: number): number {
	return (
		DELIVERY_ATTEMPT_TIMEOUT_MS + backoffDelay(deliveries as SequenceNumber)
	);
}
