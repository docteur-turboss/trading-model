import type { BrandedString } from "./branded-utils";
import { createStringBrand } from "./branded-utils";

export type ServiceId = BrandedString<"ServiceId">;
export const ServiceId = createStringBrand("ServiceId");
export function toServiceId(value: string): ServiceId {
	return ServiceId.of(value);
}
export function fromServiceId(value: ServiceId): string {
	return value;
}

export type InstanceId = BrandedString<"InstanceId">;
export const InstanceId = createStringBrand("InstanceId");
export function toInstanceId(value: string): InstanceId {
	return InstanceId.of(value);
}
export function fromInstanceId(value: InstanceId): string {
	return value;
}

export type Region = BrandedString<"Region">;
export const Region = createStringBrand("Region");
export function toRegion(value: string): Region {
	return Region.of(value);
}
export function fromRegion(value: Region): string {
	return value;
}

export type ModelId = BrandedString<"ModelId">;
export const ModelId = createStringBrand("ModelId");
export function toModelId(value: string): ModelId {
	return ModelId.of(value);
}
export function fromModelId(value: ModelId): string {
	return value;
}

export type Version = BrandedString<"Version">;
export const Version = createStringBrand("Version");
export function toVersion(value: string): Version {
	return Version.of(value);
}
export function fromVersion(value: Version): string {
	return value;
}

export type Capability = BrandedString<"Capability">;
export const Capability = createStringBrand("Capability");
export function toCapability(value: string): Capability {
	return Capability.of(value);
}
export function fromCapability(value: Capability): string {
	return value;
}

export type GenomeId = BrandedString<"GenomeId">;
export const GenomeId = createStringBrand("GenomeId");
export function toGenomeId(value: string): GenomeId {
	return GenomeId.of(value);
}
export function fromGenomeId(value: GenomeId): string {
	return value;
}

export type KeyId = BrandedString<"KeyId">;
export const KeyId = createStringBrand("KeyId");
export function toKeyId(value: string): KeyId {
	return KeyId.of(value);
}
export function fromKeyId(value: KeyId): string {
	return value;
}

export type TenantId = BrandedString<"TenantId">;
export const TenantId = createStringBrand("TenantId");
export function toTenantId(value: string): TenantId {
	return TenantId.of(value);
}
export function fromTenantId(value: TenantId): string {
	return value;
}
