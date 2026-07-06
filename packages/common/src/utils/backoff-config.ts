export interface BackoffConfig {
	baseDelayMs?: number;
	maxDelayMs?: number;
	jitterMs?: number;
}

export function computeExponentialBackoff(
	attempt: number,
	options: { baseDelayMs: number; maxDelayMs: number },
): number {
	return Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: { baseDelayMs: number; maxDelayMs: number; jitterMs: number },
): number {
	const delay = computeExponentialBackoff(attempt, options);
	return delay + (options.jitterMs > 0 ? Math.random() * options.jitterMs : 0);
}
