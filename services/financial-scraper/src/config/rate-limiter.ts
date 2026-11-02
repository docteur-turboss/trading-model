import { sleep } from "@trading-model/common/utils/sleep";

interface RateLimitBucket {
	capacity: number;
	tokens: number;
	refillRate: number;
	lastRefill: number;
}

const RATE_LIMIT_BUCKETS: Record<string, RateLimitBucket> = {};
const DEFAULT_CAPACITY = 1200;
const DEFAULT_REFILL_RATE = 20;

function _getBucket(baseURL: string): RateLimitBucket {
	if (!RATE_LIMIT_BUCKETS[baseURL]) {
		RATE_LIMIT_BUCKETS[baseURL] = {
			capacity: DEFAULT_CAPACITY,
			tokens: DEFAULT_CAPACITY,
			refillRate: DEFAULT_REFILL_RATE,
			lastRefill: Date.now(),
		};
	}
	return RATE_LIMIT_BUCKETS[baseURL];
}

function _refillBucket(bucket: RateLimitBucket): void {
	const now = Date.now();
	const elapsed = (now - bucket.lastRefill) / 1000;
	bucket.tokens = Math.min(
		bucket.capacity,
		bucket.tokens + elapsed * bucket.refillRate
	);
	bucket.lastRefill = now;
}

export async function acquireToken(
	baseURL: string,
	weight: number
): Promise<void> {
	const bucket = _getBucket(baseURL);
	while (true) {
		_refillBucket(bucket);
		if (bucket.tokens >= weight) {
			bucket.tokens -= weight;
			return;
		}
		await sleep(50);
	}
}
