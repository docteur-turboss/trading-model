import { parseCommaSeparated } from "@trading-model/common/utils/comma-separated";
import { DEFAULT_PRIVATE_CIDRS } from "@trading-model/primitives/primitives";
import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";

const API_GATEWAY_ENV_SHAPE = {
	DISCOVERY_SERVICE_URL: z
		.string()
		.url()
		.default("https://discovery-server:3000"),
	RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
	CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
	AUTH_TOKEN_HEADER: z.string().default("x-api-key"),
	AUTH_STRICT: z
		.string()
		.default("true")
		.transform((value) => value !== "false"),
	AUTH_TOKENS: z.string().default(""),
	PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
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
	if (data.NODE_ENV !== "production") {
		return;
	}
	// Non-strict mode with no token accepts any API key: never in production.
	if (!data.AUTH_STRICT) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: "AUTH_STRICT cannot be false in production",
			path: ["AUTH_STRICT"],
		});
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
