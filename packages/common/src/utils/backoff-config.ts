import { DurationMs } from "@trading-model/primitives/primitives/time-ids";
import { DelayRange } from "./delay-range";

export interface BackoffConfig {
	baseDelayMs?: DurationMs;
	maxDelayMs?: DurationMs;
	jitterMs?: DurationMs;
}

function _delayRange(options: BackoffConfig): DelayRange {
	return new DelayRange({
		baseMs: options.baseDelayMs ?? DurationMs.of(200),
		maxMs: options.maxDelayMs ?? DurationMs.of(5000),
	});
}

export function computeExponentialBackoff(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	return _delayRange(options).backoff(attempt);
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	return _delayRange(options).withJitter(
		attempt,
		options.jitterMs ?? DurationMs.of(0)
	);
}
