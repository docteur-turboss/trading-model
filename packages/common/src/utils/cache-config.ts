import type { DurationMs } from "../domain/primitives";

export interface CacheConfig {
	maxSize: number;
	ttlMs?: DurationMs;
}
