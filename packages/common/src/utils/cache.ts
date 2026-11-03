export interface ISyncCache<TValue = unknown> {
	get(key: string): TValue | undefined;
	set(key: string, value: TValue, ttlMs?: number): void;
	delete(key: string): void;
	clear(): void;
	has?(key: string): boolean;
	invalidate?(pattern: string): void;
}

export interface ICache<TValue = unknown> {
	get(key: string): TValue | null | Promise<TValue | null>;
	set(key: string, value: TValue, ttlMs?: number): void | Promise<void>;
	delete(key: string): void | Promise<void>;
	clear(): void | Promise<void>;
	has?(key: string): boolean | Promise<boolean>;
	invalidate?(pattern: string): void | Promise<void>;
}
