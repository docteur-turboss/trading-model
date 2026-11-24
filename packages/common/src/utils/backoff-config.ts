import { DurationMs } from "@trading-model/primitives/primitives/time-ids";

export interface BackoffConfig {
	baseDelayMs?: DurationMs;
	maxDelayMs?: DurationMs;
}

export function computeExponentialBackoff(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	const base = options.baseDelayMs ?? DurationMs.of(200);
	const max = options.maxDelayMs ?? DurationMs.of(5000);
	if (base <= 0) {
		throw new RangeError(`baseDelayMs (${base}) must be > 0`);
	}
	if (base > max) {
		throw new RangeError(
			`baseDelayMs (${base}) must be <= maxDelayMs (${max})`
		);
	}
	return DurationMs.of(Math.min(base * 2 ** attempt, max));
}

/** Proportional jitter: delay = min(maxDelayMs, backoff * (1 + u)), u uniform in [-0.2, 0.2). Replicas retrying after a shared outage spread out. */
export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	const max = options.maxDelayMs ?? DurationMs.of(5000);
	const delay = computeExponentialBackoff(attempt, options);
	return DurationMs.of(
		Math.min(delay * (1 + (Math.random() * 0.4 - 0.2)), max)
	);
}
