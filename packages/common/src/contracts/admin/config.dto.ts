export interface ConfigEntry {
	key: string;
	value: string;
	masked: boolean;
	source: "Vault" | "ConfigMap" | "EnvVar" | "Local";
	service: string;
	updatedAt: string;
}
