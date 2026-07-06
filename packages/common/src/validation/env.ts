import { z } from "zod";

import { logger } from "../config/logger";
import { AppError, ErrorCodes, normalizeError } from "../utils/errors";

/** Zod schema for base environment variables shared across all services. */
export const BaseEnvSchema = z.object({
	NODE_ENV: z
		.enum(["development", "test", "staging", "production"])
		.default("development"),

	PORT: z.coerce.number().int().positive().default(3000),

	TLS_KEY_PATH: z.string().min(1),
	TLS_CERT_PATH: z.string().min(1),
	TLS_CA_PATH: z.string().min(1),

	LOG_LEVEL: z.enum(["error", "warn", "info", "debug"]).default("info"),

	/** URL of the CA service for automatic certificate provisioning at startup. */
	CERT_CLIENT_CA_URL: z.string().url().optional(),

	/** Service identity for the certificate (default: APP_NAME). */
	CERT_CLIENT_SERVICE_ID: z.string().min(1).optional(),

	/** Common Name for the certificate (default: service ID). */
	CERT_CLIENT_COMMON_NAME: z.string().min(1).optional(),

	/** Comma-separated Subject Alternative Names (default: service ID). */
	CERT_CLIENT_SANS: z.string().optional(),

	/** Bootstrap token for initial certificate request. */
	CERT_CLIENT_BOOTSTRAP_TOKEN: z.string().optional(),
});

/** Inferred type for validated base environment variables. */
export type BaseEnv = z.infer<typeof BaseEnvSchema>;

/** Zod schema for address manager service environment variables. */
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

	/**
	 * Optional JSON array of discovery server URLs for multi-region failover.
	 * When set, the client tries each URL in order.
	 * @example '["https://ds-us-east:3000","https://ds-eu-west:3000"]'
	 */
	ADDRESS_MANAGER_URLS: z.string().optional(),

	/** Deployment region / datacenter identifier for multi-region routing. */
	REGION: z.string().optional(),

	ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal("")]).default(""),
	MESSAGE_BUS_INIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
	MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(2000),
	MESSAGE_CALLBACK_PATH: z.string().min(1).default("message"),

	/**
	 * Optional JSON mapping from logical service names to deployment-specific DNS names.
	 * Parsed safely — invalid JSON or non-object values fall back to `{}`.
	 * @example '{"discovery-service":"discovery-server","message-delivery-service":"message-manager"}'
	 */
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

/** Inferred type for validated address manager environment variables. */
export type AddressManagerEnv = z.infer<typeof AddressManagerEnvSchema>;

/**
 * Validates environment variables against a Zod schema.
 *
 * @throws {ConfigurationError} When validation fails — callers should handle
 * this at the application boundary (e.g. exit with a clear message).
 */
export function validateEnv<TSchema extends z.ZodType>(
	schema: TSchema
): z.infer<TSchema> {
	const parsed = schema.safeParse(process.env);

	if (!parsed.success) {
		let errors: unknown = parsed.error;
		if (typeof z.treeifyError === "function") {
			try {
				errors = z.treeifyError(parsed.error);
			} catch (err) {
				logger.warn("Failed to treeify Zod error, using raw format", {
					context: {
						err: normalizeError(err),
					},
				});
			}
		}
		console.error("Invalid environment configuration", { errors });
		throw new AppError(
			"Environment validation failed",
			ErrorCodes.CONFIGURATION_ERROR,
			{
				cause: parsed.error,
			}
		);
	}

	return parsed.data;
}
