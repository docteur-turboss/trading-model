import type { ServiceId, UnixTimestamp } from "../../domain/primitives";

export enum ConfigSource {
	Vault = "Vault",
	ConfigMap = "ConfigMap",
	EnvVar = "EnvVar",
	Local = "Local",
}

export interface ConfigEntry {
	key: string;
	value: string;
	masked: boolean;
	source: ConfigSource;
	service: ServiceId;
	updatedAt: UnixTimestamp;
}
