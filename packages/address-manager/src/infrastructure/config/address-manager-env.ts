import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";

export interface AddressManagerEnv extends TlsEnvVars {
	ADDRESS_MANAGER_URL: string;
	ADDRESS_MANAGER_URLS?: string;
	CACHE_TTL_MS: number;
	DISCOVERY_TIMEOUT_MS: number;
	INSTANCE_ID: string;
	SERVICE_NAME: string;
	SERVICE_PING_TIMEOUT_MS: number;
	PORT: number;
	TOKEN_REFRESH_INTERVAL_MS: number;
	TTL_REFRESH_INTERVAL_MS: number;
	REGION?: string;
	PUBLIC_IP?: string;
	LOCAL_DISCOVERY_URL?: string;
	DNS_NAME_MAP?: Record<string, string>;
	METRICS_INTERVAL_MS?: number;
	MAX_CALL_RECORDS?: number;
	PREFERRED_NETWORK_INTERFACE?: string;
}

export function resolveDiscoveryUrls(
	singleUrl: string,
	urlsJson?: string
): string[] {
	if (urlsJson) {
		try {
			const parsed = JSON.parse(urlsJson);
			if (Array.isArray(parsed) && parsed.length > 0) {
				return parsed.map(String);
			}
		} catch (err) {
			logger.warn(
				"Failed to parse ADDRESS_MANAGER_URLS, falling back to single URL",
				{
					err: normalizeError(err),
				}
			);
		}
	}
	return [singleUrl];
}
