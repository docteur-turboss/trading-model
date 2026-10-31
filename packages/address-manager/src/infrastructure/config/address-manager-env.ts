import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import type { RedisEnv } from "@trading-model/persistence/redis-env";

/** REDIS_* are present only in services whose schema includes RedisEnvSchema. */
export interface AddressManagerEnv extends TlsEnvVars, RedisEnv {
	ADDRESS_MANAGER_URL: string;
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
