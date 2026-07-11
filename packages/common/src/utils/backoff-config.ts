import { DelayRange } from "./delay-range";

export interface BackoffConfig {
	baseDelayMs?: number;
	maxDelayMs?: number;
	jitterMs?: number;
}

export function createDelayRange(baseMs: number, maxMs: number): DelayRange {
	return new DelayRange(baseMs, maxMs);
}

export function computeExponentialBackoff(
	attempt: number,
	options: BackoffConfig
): number {
	return new DelayRange(
		options.baseDelayMs ?? 200,
		options.maxDelayMs ?? 5000
	).backoff(attempt);
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: BackoffConfig
): number {
	return new DelayRange(
		options.baseDelayMs ?? 200,
		options.maxDelayMs ?? 5000
	).withJitter(attempt, options.jitterMs ?? 0);
}
