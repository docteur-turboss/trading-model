import {
	DurationMs,
	toDurationMs,
} from "@trading-model/primitives/primitives/time-ids";

export interface BackoffConfig {
	baseDelayMs?: DurationMs;
	maxDelayMs?: DurationMs;
	jitterMs?: DurationMs;
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
	return toDurationMs(Math.min(base * 2 ** attempt, max));
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: BackoffConfig
): DurationMs {
	const jitter = options.jitterMs ?? 0;
	return toDurationMs(
		computeExponentialBackoff(attempt, options) +
			(jitter > 0 ? Math.random() * jitter : 0)
	);
}
