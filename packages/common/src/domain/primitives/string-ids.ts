export type ServiceId = string & { readonly __brand: "ServiceId" };
export function toServiceId(value: string): ServiceId {
	return value as ServiceId;
}
export function fromServiceId(value: ServiceId): string {
	return value;
}

export type InstanceId = string & { readonly __brand: "InstanceId" };
export function toInstanceId(value: string): InstanceId {
	return value as InstanceId;
}
export function fromInstanceId(value: InstanceId): string {
	return value;
}

export type Region = string & { readonly __brand: "Region" };
export function toRegion(value: string): Region {
	return value as Region;
}
export function fromRegion(value: Region): string {
	return value;
}

export type ModelId = string & { readonly __brand: "ModelId" };
export function toModelId(value: string): ModelId {
	return value as ModelId;
}
export function fromModelId(value: ModelId): string {
	return value;
}

export type Topic = string & { readonly __brand: "Topic" };
export function toTopic(value: string): Topic {
	return value as Topic;
}
export function fromTopic(value: Topic): string {
	return value;
}

export type CorrelationId = string & { readonly __brand: "CorrelationId" };
export function toCorrelationId(value: string): CorrelationId {
	return value as CorrelationId;
}
export function fromCorrelationId(value: CorrelationId): string {
	return value;
}

export type MessageId = string & { readonly __brand: "MessageId" };
export function toMessageId(value: string): MessageId {
	return value as MessageId;
}
export function fromMessageId(value: MessageId): string {
	return value;
}

export type JobId = string & { readonly __brand: "JobId" };
export function toJobId(value: string): JobId {
	return value as JobId;
}
export function fromJobId(value: JobId): string {
	return value;
}

export type SerialNumber = string & { readonly __brand: "SerialNumber" };
export function toSerialNumber(value: string): SerialNumber {
	return value as SerialNumber;
}
export function fromSerialNumber(value: SerialNumber): string {
	return value;
}

export type Fingerprint = string & { readonly __brand: "Fingerprint" };
export function toFingerprint(value: string): Fingerprint {
	return value as Fingerprint;
}
export function fromFingerprint(value: Fingerprint): string {
	return value;
}

export type Version = string & { readonly __brand: "Version" };
export function toVersion(value: string): Version {
	return value as Version;
}
export function fromVersion(value: Version): string {
	return value;
}

export type JobType = string & { readonly __brand: "JobType" };
export function toJobType(value: string): JobType {
	return value as JobType;
}
export function fromJobType(value: JobType): string {
	return value;
}

export type Capability = string & { readonly __brand: "Capability" };
export function toCapability(value: string): Capability {
	return value as Capability;
}
export function fromCapability(value: Capability): string {
	return value;
}

export type KeyId = string & { readonly __brand: "KeyId" };
export function toKeyId(value: string): KeyId {
	return value as KeyId;
}
export function fromKeyId(value: KeyId): string {
	return value;
}

export type GenomeId = string & { readonly __brand: "GenomeId" };
export function toGenomeId(value: string): GenomeId {
	return value as GenomeId;
}
export function fromGenomeId(value: GenomeId): string {
	return value;
}

export type TenantId = string & { readonly __brand: "TenantId" };
export function toTenantId(value: string): TenantId {
	return value as TenantId;
}
export function fromTenantId(value: TenantId): string {
	return value;
}

export type ISODateTime = string & { readonly __brand: "ISODateTime" };
export function toISODateTime(value: string): ISODateTime {
	return value as ISODateTime;
}
export function fromISODateTime(value: ISODateTime): string {
	return value;
}

export type KeyVersion = number & { readonly __brand: "KeyVersion" };
export function toKeyVersion(value: number): KeyVersion {
	return value as KeyVersion;
}
export function fromKeyVersion(value: KeyVersion): number {
	return value;
}

export type UserId = string & { readonly __brand: "UserId" };
export function toUserId(value: string): UserId {
	return value as UserId;
}
export function fromUserId(value: UserId): string {
	return value;
}

export type SessionId = string & { readonly __brand: "SessionId" };
export function toSessionId(value: string): SessionId {
	return value as SessionId;
}
export function fromSessionId(value: SessionId): string {
	return value;
}

export type AuthToken = string & { readonly __brand: "AuthToken" };
export function toAuthToken(value: string): AuthToken {
	return value as AuthToken;
}
export function fromAuthToken(value: AuthToken): string {
	return value;
}
