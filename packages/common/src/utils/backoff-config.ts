import { DurationMs } from "../domain/primitives/string-ids";
import { DelayRange } from "./delay-range";

export interface BackoffConfig {
	baseDelayMs?: DurationMs;
	maxDelayMs?: DurationMs;
	jitterMs?: DurationMs;
}

export function createDelayRange(
	baseMs: DurationMs,
	maxMs: DurationMs
): DelayRange {
	return new DelayRange(baseMs, maxMs);
}

export function computeExponentialBackoff(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	return new DelayRange(
		options.baseDelayMs ?? DurationMs.of(200),
		options.maxDelayMs ?? DurationMs.of(5000)
	).backoff(attempt);
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	return new DelayRange(
		options.baseDelayMs ?? DurationMs.of(200),
		options.maxDelayMs ?? DurationMs.of(5000)
	).withJitter(attempt, options.jitterMs ?? DurationMs.of(0));
}
