import type { Percentage, ServiceId } from "../../domain/primitives";

export enum CacheStatus {
	Active = "active",
	Expired = "expired",
	Evicted = "evicted",
	Unknown = "unknown",
}

export interface CacheEntry {
	key: string;
	service: ServiceId;
	expiration: string;
	size: string;
	lastAccess: string;
	status?: CacheStatus;
}

export interface CacheStats {
	hitRate: Percentage;
	activeEntries: number;
}
