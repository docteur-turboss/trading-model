import {
	configurationError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { z } from "zod";

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
