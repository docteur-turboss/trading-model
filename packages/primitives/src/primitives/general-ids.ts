import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type ServiceId = BrandedString<"ServiceId">;
export const ServiceId = createStringBrand("ServiceId");
export function toServiceId(value: string): ServiceId {
	return ServiceId.of(value);
}
export type InstanceId = BrandedString<"InstanceId">;
export const InstanceId = createStringBrand("InstanceId");
export function toInstanceId(value: string): InstanceId {
	return InstanceId.of(value);
}
export type Region = BrandedString<"Region">;
export const Region = createStringBrand("Region");
export function toRegion(value: string): Region {
	return Region.of(value);
}
export type Version = BrandedString<"Version">;
export const Version = createStringBrand("Version");
export function toVersion(value: string): Version {
	return Version.of(value);
}
export type GenomeId = BrandedString<"GenomeId">;
export const GenomeId = createStringBrand("GenomeId");
export type TenantId = BrandedString<"TenantId">;
export const TenantId = createStringBrand("TenantId");
export function toTenantId(value: string): TenantId {
	return TenantId.of(value);
}
