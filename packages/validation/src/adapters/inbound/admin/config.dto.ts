import type {
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

export type ConfigKey = string & { readonly brand: "ConfigKey" };
export type ConfigValue = string & { readonly brand: "ConfigValue" };
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
