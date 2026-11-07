export interface ISyncCache<TValue = unknown> {
	get(key: string): TValue | undefined;
	set(key: string, value: TValue, ttlMs?: number): void;
	delete(key: string): void;
	clear(): void;
	has?(key: string): boolean;
	invalidate?(pattern: string): void;
}
