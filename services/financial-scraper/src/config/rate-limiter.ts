import { setTimeout as sleep } from "node:timers/promises";

interface RateLimitBucket {
	capacity: number;
	tokens: number;
	refillRate: number;
	lastRefill: number;
}

const RATE_LIMIT_BUCKETS: Record<string, RateLimitBucket> = {};
// Binance IP quota: 1 200 weight/min. A symbol costs 32 per minute (depth 5 +
// trades 25 + candles 2): 1 200 / 32 = 37 symbols max. Not a hard limit, the
// bucket follows the server's used weight (syncUsedWeight).
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

/**
 * Aligns the bucket on the weight Binance counted for the last minute
 * (`X-MBX-USED-WEIGHT-1M`): it only ever lowers the local balance, so the
 * server value wins when other clients share the IP quota.
 */
export function syncUsedWeight(baseURL: string, usedWeight1m: number): void {
	if (!Number.isFinite(usedWeight1m)) {
		return;
	}
	const bucket = _getBucket(baseURL);
	_refillBucket(bucket);
	bucket.tokens = Math.min(bucket.tokens, bucket.capacity - usedWeight1m);
}

const QUEUE_TAILS: Record<string, Promise<void>> = {};

async function _take(
	baseURL: string,
	weight: number,
	signal?: AbortSignal
): Promise<void> {
	signal?.throwIfAborted();
	const bucket = _getBucket(baseURL);
	_refillBucket(bucket);
	while (bucket.tokens < weight) {
		await sleep(
			((weight - bucket.tokens) / bucket.refillRate) * 1000,
			undefined,
			{
				signal,
			}
		);
		_refillBucket(bucket);
	}
	bucket.tokens -= weight;
}

/**
 * Serves requests of one base URL in arrival order: a heavy one is never
 * overtaken. Rejects when `signal` aborts, so a stopped cycle sends nothing.
 */
export function acquireToken(
	baseURL: string,
	weight: number,
	signal?: AbortSignal
): Promise<void> {
	const turn = (QUEUE_TAILS[baseURL] ?? Promise.resolve()).then(() =>
		_take(baseURL, weight, signal)
	);
	// biome-ignore lint/plugin: the caller of this turn receives the rejection; the queue behind it must not
	QUEUE_TAILS[baseURL] = turn.catch(() => undefined);
	return turn;
}
