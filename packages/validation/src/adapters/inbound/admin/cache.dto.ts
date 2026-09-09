import type {
	ISODateTime,
	Percentage,
	PositiveInt,
	ServiceId,
} from "@trading-model/common/domain/primitives";

export type CacheKey = string & { readonly brand: "CacheKey" };
export type DataSize = string & { readonly brand: "DataSize" };
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
