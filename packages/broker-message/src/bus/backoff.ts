import { computeExponentialBackoffWithJitter } from "@trading-model/common/utils/backoff-config";
import {
	DurationMs,
	type SequenceNumber,
} from "@trading-model/primitives/primitives";

const BaseDelayMs = DurationMs.of(1000);
const MaxDelayMs = DurationMs.of(20_000);

export function backoffDelay(deliveryAttempt: SequenceNumber): number {
	return Math.round(
		computeExponentialBackoffWithJitter(deliveryAttempt, {
			baseDelayMs: BaseDelayMs,
			maxDelayMs: MaxDelayMs,
		})
	);
}

/**
 * One delivery attempt lasts at most this long before another replica may claim
 * the entry. Above the slowest real handler: model-evaluator downloads weights
 * (60 s deadline) then reads candles and replays; 90 s leaves margin. The
 * model-evaluator pod grace period (120 s) covers preStop plus an 85 s handler.
 */
export const DELIVERY_ATTEMPT_TIMEOUT_MS = DurationMs.of(90_000);

const CLAIM_MARGIN_MS = 5000;

/** A handler is abandoned (retryable failure) before the entry can be claimed by another replica. */
export const HANDLER_TIMEOUT_MS = DurationMs.of(
	DELIVERY_ATTEMPT_TIMEOUT_MS - CLAIM_MARGIN_MS
);

/** After the abort a handler may take this long to return; within the claim margin, so its slot is freed before another replica can claim the entry. */
export const ABORT_GRACE_MS = DurationMs.of(CLAIM_MARGIN_MS - 1000);

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
