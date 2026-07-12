import type {
	ISODateTime,
	Percentage,
	PositiveInt,
	ServiceId,
} from "../../domain/primitives";

export type CacheKey = string & { readonly brand: "CacheKey" };
export function toCacheKey(value: string): CacheKey {
	return value as CacheKey;
}
export function fromCacheKey(value: CacheKey): string {
	return value;
}

export type DataSize = string & { readonly brand: "DataSize" };
export function toDataSize(value: string): DataSize {
	return value as DataSize;
}
export function fromDataSize(value: DataSize): string {
	return value;
}

export enum CacheStatus {
	Active = "active",
	Expired = "expired",
	Evicted = "evicted",
	Unknown = "unknown",
}

export interface CacheEntry {
	key: CacheKey;
	service: ServiceId;
	expiration: ISODateTime;
	size: DataSize;
	lastAccess: ISODateTime;
	status?: CacheStatus;
}

export interface CacheStats {
	hitRate: Percentage;
	activeEntries: PositiveInt;
}
