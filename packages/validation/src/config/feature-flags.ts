import { z } from "zod";

/**
 * Boolean feature flag read from an environment variable (ADR-0039).
 * Accepts `true|false|1|0|yes|no|on|off`; any other value fails
 * `validateEnv` at startup. Name the variable `FEATURE_<NAME>`.
 */
export function featureFlag(defaultValue: boolean) {
	return z.stringbool().default(defaultValue);
}
