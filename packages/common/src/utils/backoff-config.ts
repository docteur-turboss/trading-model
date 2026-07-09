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
	options: { baseDelayMs: number; maxDelayMs: number }
): number {
	return new DelayRange(options.baseDelayMs, options.maxDelayMs).backoff(
		attempt
	);
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: { baseDelayMs: number; maxDelayMs: number; jitterMs: number }
): number {
	return new DelayRange(options.baseDelayMs, options.maxDelayMs).withJitter(
		attempt,
		options.jitterMs
	);
}
