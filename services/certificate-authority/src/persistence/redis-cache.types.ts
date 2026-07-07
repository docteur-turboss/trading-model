export interface CacheOptions {
	ttlMs: number;
	prefix: string;
}

export interface CacheSetEntry {
	key: string;
	value: unknown;
	ttlMs: number;
}

export interface RedisCache {
	disconnect(): Promise<void>;
	isAvailable(): boolean;
	get<TData>(key: string): Promise<TData | null>;
	set(entry: CacheSetEntry): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	makeKey(parts: string[]): string;
}
