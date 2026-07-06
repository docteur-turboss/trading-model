import type { ServiceId } from "../../domain/primitives";

export type CacheStatus = "active" | "expired" | "evicted" | "unknown";

export interface CacheEntry {
	key: string;
	service: ServiceId;
	expiration: string;
	size: string;
	lastAccess: string;
	status?: CacheStatus;
}

export interface CacheStats {
	hitRate: number;
	activeEntries: number;
}
