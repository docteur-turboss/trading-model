import type { DurationMs } from "@trading-model/common/domain/primitives";

export interface CacheOptions {
	ttlMs: DurationMs;
	prefix: string;
}

export interface RedisCache {
	disconnect(): Promise<void>;
	isAvailable(): boolean;
	get<TData>(key: string): Promise<TData | null>;
	set(key: string, value: unknown, ttlMs?: DurationMs): Promise<void>;
	delete(key: string): Promise<void>;
	clear(): Promise<void>;
	makeKey(parts: string[]): string;
}
