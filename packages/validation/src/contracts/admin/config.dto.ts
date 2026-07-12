import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

export type ConfigKey = string & { readonly brand: "ConfigKey" };
export const ConfigKey = {
	of(value: string): ConfigKey {
		if (typeof value !== "string" || value.length === 0) {
			throw new RangeError(
				`ConfigKey must be a non-empty string, got ${JSON.stringify(value)}`
			);
		}
		return value as ConfigKey;
	},
};

export type ConfigValue = string & { readonly brand: "ConfigValue" };
export const ConfigValue = {
	of(value: string): ConfigValue {
		if (typeof value !== "string") {
			throw new RangeError(`ConfigValue must be a string, got ${typeof value}`);
		}
		return value as ConfigValue;
	},
};

export enum ConfigSource {
	Vault = "Vault",
	ConfigMap = "ConfigMap",
	EnvVar = "EnvVar",
	Local = "Local",
}

export interface ConfigEntry {
	key: ConfigKey;
	value: ConfigValue;
	masked: boolean;
	source: ConfigSource;
	service: ServiceId;
	updatedAt: UnixTimestamp;
}
