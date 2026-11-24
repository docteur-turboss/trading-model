import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type ServiceId = BrandedString<"ServiceId">;
export const ServiceId = createStringBrand("ServiceId");
export type InstanceId = BrandedString<"InstanceId">;
export const InstanceId = createStringBrand("InstanceId");
export type Region = BrandedString<"Region">;
export const Region = createStringBrand("Region");
export type Version = BrandedString<"Version">;
export const Version = createStringBrand("Version");
export type GenomeId = BrandedString<"GenomeId">;
export const GenomeId = createStringBrand("GenomeId");
export type TenantId = BrandedString<"TenantId">;
export const TenantId = createStringBrand("TenantId");
