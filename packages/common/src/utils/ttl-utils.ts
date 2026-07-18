export interface TtlEntry<TValue> {
	value: TValue;
	expiresAt: number;
}

export function isExpired(entry: TtlEntry<unknown>): boolean {
	return Date.now() > entry.expiresAt;
}

export function isExpiredAt(timestamp: number): boolean {
	return Date.now() > timestamp;
}

export function isExpiredElapsed(createdAt: number, ttlMs: number): boolean {
	return Date.now() - createdAt > ttlMs;
}
