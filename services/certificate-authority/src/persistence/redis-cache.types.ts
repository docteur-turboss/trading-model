export interface CacheOptions {
	ttlMs: number;
	prefix: string;
}

export interface RedisCache {
	disconnect(): Promise<void>;
	isAvailable(): boolean;
	get<TData>(key: string): Promise<TData | null>;
	set(key: string, value: unknown, ttlMs?: number): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	makeKey(parts: string[]): string;
}
