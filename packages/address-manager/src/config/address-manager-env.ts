import { logger } from "@trading-model/common/config/logger";
import type { TlsEnvVars } from "@trading-model/common/domain/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";

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
	WS_URL?: string;
	WS_SUBSCRIBED_SERVICES?: string;
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

export function resolveWsSubscribedServices(
	raw?: string
): string[] | undefined {
	if (!raw) {
		return;
	}
	try {
		const parsed = JSON.parse(raw);
		if (Array.isArray(parsed) && parsed.length > 0) {
			return parsed.map(String);
		}
	} catch (err) {
		logger.warn(
			"Failed to parse WS_SUBSCRIBED_SERVICES, subscribing to all services",
			{
				err: normalizeError(err),
			}
		);
	}
}
