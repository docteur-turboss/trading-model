import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import {
	DurationMs,
	type SequenceNumber,
} from "@trading-model/primitives/primitives";

const BaseDelayMs = DurationMs.of(1000);
// Keeps the whole retry budget inside the publish timeout (maxDeliveryDurationMs).
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

/**
 * Longest time a message can spend in delivery to one subscriber: every
 * attempt runs to its timeout, and the pause after each failed attempt but
 * the last gets the maximum jitter.
 */
export function maxDeliveryDurationMs(
	maxAttempts: number,
	attemptTimeoutMs: number
): number {
	let total = maxAttempts * attemptTimeoutMs;
	for (let attempt = 1; attempt < maxAttempts; attempt++) {
		const delay = computeExponentialBackoff(attempt, {
			baseDelayMs: BaseDelayMs,
			maxDelayMs: MaxDelayMs,
		});
		total += delay * (1 + JitterFactor);
	}
	return Math.ceil(total);
}
