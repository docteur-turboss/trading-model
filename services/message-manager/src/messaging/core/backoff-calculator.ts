import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";

const BaseDelayMs = 1000;
const MaxDelayMs = 60_000;
const JitterFactor = 0.2;

export function backoffDelay(deliveryAttempt: number): number {
	const delay = computeExponentialBackoff(deliveryAttempt, {
		baseDelayMs: BaseDelayMs,
		maxDelayMs: MaxDelayMs,
	});
	const jitter = delay * JitterFactor * (Math.random() * 2 - 1);
	return Math.max(0, Math.round(delay + jitter));
}
