export interface BackoffConfig {
	baseDelayMs?: number;
	maxDelayMs?: number;
	jitterMs?: number;
}

export interface BackoffRequired {
	baseDelayMs: number;
	maxDelayMs: number;
}

export function computeExponentialBackoff(
	attempt: number,
	options: BackoffRequired
): number {
	return Math.min(options.baseDelayMs * 2 ** attempt, options.maxDelayMs);
}

export function computeExponentialBackoffWithJitter(
	attempt: number,
	options: BackoffRequired & { jitterMs: number }
): number {
	const delay = computeExponentialBackoff(attempt, options);
	return delay + (options.jitterMs > 0 ? Math.random() * options.jitterMs : 0);
}
