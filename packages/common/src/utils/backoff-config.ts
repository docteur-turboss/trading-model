export interface BackoffConfig {
	baseDelayMs?: number;
	maxDelayMs?: number;
}

export function computeExponentialBackoff(
	baseDelayMs: number,
	attempt: number,
	maxDelayMs: number,
): number {
	return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

export function computeExponentialBackoffWithJitter(
	baseDelayMs: number,
	attempt: number,
	maxDelayMs: number,
	jitterMs: number,
): number {
	const delay = computeExponentialBackoff(baseDelayMs, attempt, maxDelayMs);
	return delay + (jitterMs > 0 ? Math.random() * jitterMs : 0);
}
