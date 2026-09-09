import { LogLevel } from "@trading-model/common/config/log-types";
import { logger } from "@trading-model/common/config/logger";
import { NODE_ENVS } from "@trading-model/common/config/node-env";
import { TlsEnvVarsSchema } from "@trading-model/common/domain/tls-paths";
import {
	configurationError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { z } from "zod";

/** Zod schema for base environment variables shared across all services. */
export const BaseEnvSchema = z.object({
	NODE_ENV: z.enum(NODE_ENVS).default("development"),

	PORT: z.coerce.number().int().positive().default(3000),

	...TlsEnvVarsSchema.shape,

	LOG_LEVEL: z.nativeEnum(LogLevel).default(LogLevel.Info),
});

/** Inferred type for validated base environment variables. */
export type BaseEnv = z.infer<typeof BaseEnvSchema>;

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
		_handleValidationError(parsed.error);
	}
	return parsed.data;
}

function _treeifyErrors(error: z.ZodError): unknown {
	if (typeof z.treeifyError !== "function") {
		return error;
	}
	try {
		return z.treeifyError(error);
	} catch (err) {
		logger.warn("Failed to treeify Zod error, using raw format", {
			context: { err: normalizeError(err) },
		});
		return error;
	}
}

function _handleValidationError(error: z.ZodError): never {
	const errors = _treeifyErrors(error);
	console.error("Invalid environment configuration", { errors });
	throw configurationError("Environment validation failed", {
		cause: error,
	});
}
