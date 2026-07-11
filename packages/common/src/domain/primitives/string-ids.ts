// ============================================================================
// Generic branded-type utilities
// ============================================================================

type BrandedString<Tag extends string> = string & { readonly brand: Tag };
type BrandedNumber<Tag extends string> = number & { readonly brand: Tag };

interface StringBrand<Tag extends string> {
	of(value: string): BrandedString<Tag>;
}

interface NumberBrand<Tag extends string> {
	of(value: number): BrandedNumber<Tag>;
}

function createStringBrand<Tag extends string>(
	tag: Tag,
	validate?: (value: string) => void
): StringBrand<Tag> {
	return {
		of(value: string): BrandedString<Tag> {
			if (typeof value !== "string" || value.length === 0) {
				throw new RangeError(
					`${tag} must be a non-empty string, got ${JSON.stringify(value)}`
				);
			}
			validate?.(value);
			return value as BrandedString<Tag>;
		},
	};
}

function createNumberBrand<Tag extends string>(
	_tag: Tag,
	validate: (value: number) => void
): NumberBrand<Tag> {
	return {
		of(value: number): BrandedNumber<Tag> {
			validate(value);
			return value as BrandedNumber<Tag>;
		},
	};
}

// ============================================================================
// Simple string IDs (non-empty string validation)
// ============================================================================

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

export type Topic = BrandedString<"Topic">;
export const Topic = createStringBrand("Topic");
export function toTopic(value: string): Topic {
	return Topic.of(value);
}
export function fromTopic(value: Topic): string {
	return value;
}

export type CorrelationId = BrandedString<"CorrelationId">;
export const CorrelationId = createStringBrand("CorrelationId");
export function toCorrelationId(value: string): CorrelationId {
	return CorrelationId.of(value);
}
export function fromCorrelationId(value: CorrelationId): string {
	return value;
}

export type MessageId = BrandedString<"MessageId">;
export const MessageId = createStringBrand("MessageId");
export function toMessageId(value: string): MessageId {
	return MessageId.of(value);
}
export function fromMessageId(value: MessageId): string {
	return value;
}

export type JobId = BrandedString<"JobId">;
export const JobId = createStringBrand("JobId");
export function toJobId(value: string): JobId {
	return JobId.of(value);
}
export function fromJobId(value: JobId): string {
	return value;
}

export type SerialNumber = BrandedString<"SerialNumber">;
export const SerialNumber = createStringBrand("SerialNumber");
export function toSerialNumber(value: string): SerialNumber {
	return SerialNumber.of(value);
}
export function fromSerialNumber(value: SerialNumber): string {
	return value;
}

export type Fingerprint = BrandedString<"Fingerprint">;
export const Fingerprint = createStringBrand("Fingerprint");
export function toFingerprint(value: string): Fingerprint {
	return Fingerprint.of(value);
}
export function fromFingerprint(value: Fingerprint): string {
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

export type JobType = BrandedString<"JobType">;
export const JobType = createStringBrand("JobType");
export function toJobType(value: string): JobType {
	return JobType.of(value);
}
export function fromJobType(value: JobType): string {
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

export type KeyId = BrandedString<"KeyId">;
export const KeyId = createStringBrand("KeyId");
export function toKeyId(value: string): KeyId {
	return KeyId.of(value);
}
export function fromKeyId(value: KeyId): string {
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

export type TenantId = BrandedString<"TenantId">;
export const TenantId = createStringBrand("TenantId");
export function toTenantId(value: string): TenantId {
	return TenantId.of(value);
}
export function fromTenantId(value: TenantId): string {
	return value;
}

export type UserId = BrandedString<"UserId">;
export const UserId = createStringBrand("UserId");
export function toUserId(value: string): UserId {
	return UserId.of(value);
}
export function fromUserId(value: UserId): string {
	return value;
}

export type SessionId = BrandedString<"SessionId">;
export const SessionId = createStringBrand("SessionId");
export function toSessionId(value: string): SessionId {
	return SessionId.of(value);
}
export function fromSessionId(value: SessionId): string {
	return value;
}

export type AuthToken = BrandedString<"AuthToken">;
export const AuthToken = createStringBrand("AuthToken");
export function toAuthToken(value: string): AuthToken {
	return AuthToken.of(value);
}
export function fromAuthToken(value: AuthToken): string {
	return value;
}

export type ClientIdentity = BrandedString<"ClientIdentity">;
export const ClientIdentity = createStringBrand("ClientIdentity");
export function toClientIdentity(value: string): ClientIdentity {
	return ClientIdentity.of(value);
}
export function fromClientIdentity(value: ClientIdentity): string {
	return value;
}

export type Subject = BrandedString<"Subject">;
export const Subject = createStringBrand("Subject");
export function toSubject(value: string): Subject {
	return Subject.of(value);
}
export function fromSubject(value: Subject): string {
	return value;
}

export type Role = BrandedString<"Role">;
export const Role = createStringBrand("Role");
export function toRole(value: string): Role {
	return Role.of(value);
}
export function fromRole(value: Role): string {
	return value;
}

export type Environment = BrandedString<"Environment">;
export const Environment = createStringBrand("Environment");
export function toEnvironment(value: string): Environment {
	return Environment.of(value);
}
export function fromEnvironment(value: Environment): string {
	return value;
}

export type DbUser = BrandedString<"DbUser">;
export const DbUser = createStringBrand("DbUser");
export function toDbUser(value: string): DbUser {
	return DbUser.of(value);
}
export function fromDbUser(value: DbUser): string {
	return value;
}

export type DbPassword = BrandedString<"DbPassword">;
export const DbPassword = createStringBrand("DbPassword");
export function toDbPassword(value: string): DbPassword {
	return DbPassword.of(value);
}
export function fromDbPassword(value: DbPassword): string {
	return value;
}

export type DbName = BrandedString<"DbName">;
export const DbName = createStringBrand("DbName");
export function toDbName(value: string): DbName {
	return DbName.of(value);
}
export function fromDbName(value: DbName): string {
	return value;
}

// ============================================================================
// String IDs with custom validation
// ============================================================================

export type ISODateTime = BrandedString<"ISODateTime">;
export const ISODateTime = createStringBrand("ISODateTime", (value) => {
	if (Number.isNaN(Date.parse(value))) {
		throw new RangeError(
			`ISODateTime must be a valid ISO date string, got ${JSON.stringify(value)}`
		);
	}
});
export function toISODateTime(value: string): ISODateTime {
	return ISODateTime.of(value);
}
export function fromISODateTime(value: ISODateTime): string {
	return value;
}

const pemValidator = (type: string) => (value: string) => {
	if (!value.includes("-----BEGIN")) {
		throw new RangeError(
			`${type} must be a valid PEM, got ${JSON.stringify(value.slice(0, 60))}`
		);
	}
};

export type CertPem = BrandedString<"CertPem">;
export const CertPem = createStringBrand("CertPem", pemValidator("CertPem"));
export function toCertPem(value: string): CertPem {
	return CertPem.of(value);
}
export function fromCertPem(value: CertPem): string {
	return value;
}

export type CaPem = BrandedString<"CaPem">;
export const CaPem = createStringBrand("CaPem", pemValidator("CaPem"));
export function toCaPem(value: string): CaPem {
	return CaPem.of(value);
}
export function fromCaPem(value: CaPem): string {
	return value;
}

export type CsrPem = BrandedString<"CsrPem">;
export const CsrPem = createStringBrand("CsrPem", pemValidator("CsrPem"));
export function toCsrPem(value: string): CsrPem {
	return CsrPem.of(value);
}
export function fromCsrPem(value: CsrPem): string {
	return value;
}

export type KeyPem = BrandedString<"KeyPem">;
export const KeyPem = createStringBrand("KeyPem", pemValidator("KeyPem"));
export function toKeyPem(value: string): KeyPem {
	return KeyPem.of(value);
}
export function fromKeyPem(value: KeyPem): string {
	return value;
}

// ============================================================================
// Number-based branded types
// ============================================================================

export type KeyVersion = BrandedNumber<"KeyVersion">;
export const KeyVersion = createNumberBrand("KeyVersion", (value) => {
	if (!Number.isInteger(value) || value < 0) {
		throw new RangeError(
			`KeyVersion must be a non-negative integer, got ${value}`
		);
	}
});
export function toKeyVersion(value: number): KeyVersion {
	return KeyVersion.of(value);
}
export function fromKeyVersion(value: KeyVersion): number {
	return value;
}

export type MessagePriority = BrandedNumber<"MessagePriority">;
export const MessagePriority = createNumberBrand("MessagePriority", (value) => {
	if (!Number.isInteger(value)) {
		throw new RangeError(`MessagePriority must be an integer, got ${value}`);
	}
});
export function toMessagePriority(value: number): MessagePriority {
	return MessagePriority.of(value);
}
export function fromMessagePriority(value: MessagePriority): number {
	return value;
}

// ============================================================================
// DurationMs — branded number with time-unit helpers
// ============================================================================

export type DurationMs = BrandedNumber<"DurationMs">;
export function toDurationMs(value: number): DurationMs {
	return DurationMs.of(value);
}
export function fromDurationMs(value: DurationMs): number {
	return value;
}
export const DurationMs = {
	of(value: number): DurationMs {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`DurationMs must be a non-negative finite number, got ${value}`
			);
		}
		return value as DurationMs;
	},

	zero(): DurationMs {
		return 0 as DurationMs;
	},
	toSeconds(value: DurationMs): number {
		return value / 1000;
	},
	toMinutes(value: DurationMs): number {
		return value / 60000;
	},

	add(left: DurationMs, right: DurationMs): DurationMs {
		return (left + right) as DurationMs;
	},
	multiply(value: DurationMs, factor: number): DurationMs {
		return (value * factor) as DurationMs;
	},

	isLongerThan(left: DurationMs, right: DurationMs): boolean {
		return left > right;
	},
	isShorterThan(left: DurationMs, right: DurationMs): boolean {
		return left < right;
	},

	fromSeconds(seconds: number): DurationMs {
		return DurationMs.of(seconds * 1000);
	},
	fromMinutes(minutes: number): DurationMs {
		return DurationMs.of(minutes * 60000);
	},
};

// ============================================================================
// SequenceNumber — branded number with monotonic increment
// ============================================================================

export type SequenceNumber = BrandedNumber<"SequenceNumber">;
export function toSequenceNumber(value: number): SequenceNumber {
	return SequenceNumber.of(value);
}
export function fromSequenceNumber(value: SequenceNumber): number {
	return value;
}
export const SequenceNumber = {
	of(value: number): SequenceNumber {
		if (!Number.isInteger(value) || value < 0) {
			throw new RangeError(
				`SequenceNumber must be a non-negative integer, got ${value}`
			);
		}
		return value as SequenceNumber;
	},

	next(value: SequenceNumber): SequenceNumber {
		return (value + 1) as SequenceNumber;
	},
	toNumber(value: SequenceNumber): number {
		return value;
	},
};
