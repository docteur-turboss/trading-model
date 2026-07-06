export interface ICache<TValue = unknown> {
	get(key: string): TValue | undefined | Promise<TValue | null>;
	set(key: string, value: TValue, ttlMs?: number): void | Promise<void>;
	delete(key: string): void | Promise<void>;
	clear(): void | Promise<void>;
	has?(key: string): boolean | Promise<boolean>;
	invalidate?(pattern: string): void | Promise<void>;
}
