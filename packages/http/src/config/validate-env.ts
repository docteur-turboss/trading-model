import { configurationError } from "@trading-model/common/utils/errors";
import type { z } from "zod";
import { logger } from "../logger";

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

// Flat path/message pairs: the log sanitizer redacts whole values under secret-looking keys (AUTH_TOKENS), which would hide the reason.
function _handleValidationError(error: z.ZodError): never {
	const issues = error.issues.map(({ path, message }) => ({
		path: path.join("."),
		message,
	}));
	logger.error("Invalid environment configuration", { issues });
	throw configurationError("Environment validation failed", {
		cause: error,
	});
}
