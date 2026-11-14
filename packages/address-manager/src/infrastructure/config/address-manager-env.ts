import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";

/** Environment variables read by the address manager, with the TLS variables. */
export interface AddressManagerEnv extends TlsEnvVars {
	ADDRESS_MANAGER_URL: string;
	/** Registered in discovery: its major is the gateway prefix /v<major>. */
	APP_VERSION?: string;
	CACHE_TTL_MS: number;
	DISCOVERY_TIMEOUT_MS: number;
	INSTANCE_ID: string;
	SERVICE_NAME: string;
	SERVICE_PING_TIMEOUT_MS: number;
	PORT: number;
	TOKEN_REFRESH_INTERVAL_MS: number;
	TTL_REFRESH_INTERVAL_MS: number;
	DNS_NAME_MAP?: Record<string, string>;
}
