import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { z } from "zod";

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

	ADDRESS_MANAGER_URLS: z.string().optional(),

	REGION: z.string().optional(),

	ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal("")]).default(""),
	MESSAGE_BUS_INIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
	MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(2000),
	MESSAGE_CALLBACK_PATH: z.string().min(1).default("message"),

	DNS_NAME_MAP: z
		.string()
		.optional()
		.default("{}")
		.transform((val) => {
			try {
				const parsed = JSON.parse(val);
				return typeof parsed === "object" &&
					parsed !== null &&
					!Array.isArray(parsed)
					? (parsed as Record<string, string>)
					: {};
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

export type AddressManagerEnv = z.infer<typeof AddressManagerEnvSchema>;
