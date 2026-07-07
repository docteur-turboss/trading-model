/**
 * Value objects for financial primitives — branded number types.
 *
 * Each type is a compile-time-only branding over `number`:
 * - No runtime overhead (they ARE numbers)
 * - Full arithmetic compatibility
 * - Construction functions validate and brand
 *
 * Follows the existing `TradingSymbol` pattern from trader-trainer.
 */

export type Price = number & { readonly __brand: "Price" };

export const Price = {
	of(value: number): Price {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Price must be a non-negative finite number, got ${value}`
			);
		}
		return value as Price;
	},

	zero(): Price {
		return 0 as Price;
	},
};

export type Cash = number & { readonly __brand: "Cash" };

export const Cash = {
	of(value: number): Cash {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Cash must be a non-negative finite number, got ${value}`
			);
		}
		return value as Cash;
	},

	zero(): Cash {
		return 0 as Cash;
	},
};

export type Volume = number & { readonly __brand: "Volume" };

export const Volume = {
	of(value: number): Volume {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`Volume must be a non-negative finite number, got ${value}`
			);
		}
		return value as Volume;
	},

	zero(): Volume {
		return 0 as Volume;
	},
};

export type Percentage = number & { readonly __brand: "Percentage" };

export const Percentage = {
	/** Create from a decimal ratio (e.g. 0.05 for 5%). */
	of(value: number): Percentage {
		if (!Number.isFinite(value)) {
			throw new RangeError(`Percentage must be a finite number, got ${value}`);
		}
		return value as Percentage;
	},

	/** Create from a percentage point value (e.g. 5 for 5%). */
	fromPercent(percent: number): Percentage {
		return Percentage.of(percent / 100);
	},

	zero(): Percentage {
		return 0 as Percentage;
	},
};

export type UnixTimestamp = number & { readonly __brand: "UnixTimestamp" };

export const UnixTimestamp = {
	of(value: number): UnixTimestamp {
		if (!Number.isFinite(value) || value < 0) {
			throw new RangeError(
				`UnixTimestamp must be a non-negative finite number, got ${value}`
			);
		}
		return value as UnixTimestamp;
	},

	now(): UnixTimestamp {
		return Date.now() as UnixTimestamp;
	},
};

export type Port = number & { readonly __brand: "Port" };

export const Port = {
	of(value: number): Port {
		if (!Number.isInteger(value) || value < 0 || value > 65535) {
			throw new RangeError(
				`Port must be an integer between 0 and 65535, got ${value}`
			);
		}
		return value as Port;
	},
};

export type IPAddress = string & { readonly __brand: "IPAddress" };

const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}$/;
const IPV6_RE = /^[0-9a-fA-F:]+$/;

export const IPAddress = {
	of(value: string): IPAddress {
		if (!(IPV4_RE.test(value) || IPV6_RE.test(value))) {
			throw new RangeError(
				`IPAddress must be a valid IPv4 or IPv6 address, got ${value}`
			);
		}
		return value as IPAddress;
	},
};

export type TradingSymbol = string & { readonly __brand: "TradingSymbol" };

export function toSymbol(_symbol: string): TradingSymbol {
	return _symbol as TradingSymbol;
}

export function fromSymbol(_symbol: TradingSymbol): string {
	return _symbol;
}

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

export type KeyVersion = number & { readonly __brand: "KeyVersion" };
export function toKeyVersion(value: number): KeyVersion {
	return value as KeyVersion;
}
export function fromKeyVersion(value: KeyVersion): number {
	return value;
}

export type GenomeId = string & { readonly __brand: "GenomeId" };
export function toGenomeId(value: string): GenomeId {
	return value as GenomeId;
}
export function fromGenomeId(value: GenomeId): string {
	return value;
}

export type WorkerStatus = "active" | "draining" | "offline";

export enum WorkerStatusCode {
	Active = "active",
	Draining = "draining",
	Offline = "offline",
}

export enum DataSource {
	Binance = "binance",
}
