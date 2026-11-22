import type { TlsEnvVars } from "@trading-model/common/config/tls-paths";
import { normalizeError } from "@trading-model/common/utils/errors";
import { isObject } from "@trading-model/contracts/wire/primitives";
import { logger } from "@trading-model/http/logger";
import { z } from "zod";

/** Environment variables read by the address manager, with the TLS variables. */
export interface AddressManagerEnv extends TlsEnvVars {
	ADDRESS_MANAGER_URL: string;
	/** Registered in discovery for release N-1 gateways only (ADR-0072). */
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

export const AddressManagerEnvSchema = z.object({
	APP_NAME: z.string().min(1),
	APP_VERSION: z.string().default("1.0.0"),
	SERVICE_NAME: z.string().min(1),
	INSTANCE_ID: z.string().min(1),
	CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
	SERVICE_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
	DISCOVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(5000),
	TOKEN_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
	TTL_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
	ADDRESS_MANAGER_URL: z.url(),

	MESSAGE_CALLBACK_PATH: z.string().min(1).default("message"),

	DNS_NAME_MAP: z
		.string()
		.default("{}")
		.transform((val) => {
			try {
				const parsed = JSON.parse(val);
				return isObject(parsed) ? (parsed as Record<string, string>) : {};
			} catch (err) {
				logger.warn(
					"Failed to parse DNS_NAME_MAP env var, falling back to {}",
					{
						context: {
							err: normalizeError(err),
						},
					}
				);
				return {};
			}
		}),
});
