import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { BaseEnvSchema } from "@trading-model/http/config/env";
import { weakSecretReason } from "@trading-model/http/config/secret-strength";
import { validateEnv } from "@trading-model/http/config/validate-env";
import { DEFAULT_PRIVATE_CIDRS } from "@trading-model/primitives/primitives";
import { z } from "zod";

import { parseApiKey } from "../../shared/api-keys";

const API_GATEWAY_ENV_SHAPE = {
	RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
	CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
	AUTH_TOKEN_HEADER: z.string().default("x-api-key"),
	AUTH_TOKENS: z.string().default(""),
	PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
	/** Larger upstream answers are cut and answered 502 (ADR-0054). 8 MiB. */
	PROXY_MAX_RESPONSE_BYTES: z.coerce
		.number()
		.int()
		.positive()
		.default(8 * 1024 * 1024),
	/** Proxied requests in flight at once; past it the gateway answers 503 (buffered answers bound the memory). */
	PROXY_MAX_CONCURRENT: z.coerce.number().int().positive().default(16),
	ALLOWED_PROXY_CIDRS: z.string().default(DEFAULT_PRIVATE_CIDRS),
} satisfies Record<string, z.ZodTypeAny>;

const API_GATEWAY_ENV_SCHEMA = BaseEnvSchema.extend(
	API_GATEWAY_ENV_SHAPE
).superRefine((data, ctx) => {
	if (data.NODE_ENV === "production" && !data.ALLOWED_PROXY_CIDRS) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message:
				"ALLOWED_PROXY_CIDRS cannot be empty in production — proxy target validation would be disabled",
			path: ["ALLOWED_PROXY_CIDRS"],
		});
	}
	for (const entry of parseCommaSeparated(data.AUTH_TOKENS)) {
		const key = parseApiKey(entry);
		if ("error" in key) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `AUTH_TOKENS: ${key.error} (format name:scope1+scope2:secret, ADR-0059)`,
				path: ["AUTH_TOKENS"],
			});
			continue;
		}
		const weak =
			data.NODE_ENV === "production" ? weakSecretReason(key.secret) : undefined;
		if (weak) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `AUTH_TOKENS: key "${key.name}" secret ${weak}`,
				path: ["AUTH_TOKENS"],
			});
		}
	}
	if (data.NODE_ENV !== "production") {
		return;
	}
	if (parseCommaSeparated(data.AUTH_TOKENS).length === 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "AUTH_TOKENS cannot be empty in production",
			path: ["AUTH_TOKENS"],
		});
	}
});

export const ENV = validateEnv(API_GATEWAY_ENV_SCHEMA);

/** The validated environment of the gateway. */
export type Env = typeof ENV;
