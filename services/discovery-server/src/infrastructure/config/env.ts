import { DEFAULT_PRIVATE_CIDRS } from "@trading-model/primitives/primitives";
import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { z } from "zod";

const DISCOVERY_EXTRA = {
	CLEANUP_SERVICE_INTERVAL_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(1_000 * 60 * 10),
	ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal("")]).default(""),
	// Empty means unset: compose passes `${SIGNING_SECRET:-}`.
	SIGNING_SECRET: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z.string().min(1).optional()
	),
	ALLOWED_REGISTRATION_CIDRS: z.string().default(DEFAULT_PRIVATE_CIDRS),
} satisfies Record<string, z.ZodTypeAny>;

const DISCOVERY_ENV_SCHEMA = BaseEnvSchema.extend(RedisEnvSchema.shape)
	.extend(DISCOVERY_EXTRA)
	.superRefine((data, ctx) => {
		if (data.NODE_ENV === "production" && !data.ALLOWED_REGISTRATION_CIDRS) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: "ALLOWED_REGISTRATION_CIDRS cannot be empty in production",
				path: ["ALLOWED_REGISTRATION_CIDRS"],
			});
		}
		// Without it each process signs instance tokens with its own random
		// secret: every restart, and every other replica, rejects them.
		if (data.NODE_ENV === "production" && !data.SIGNING_SECRET) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"SIGNING_SECRET is required in production: shared by every replica, stable across restarts",
				path: ["SIGNING_SECRET"],
			});
		}
	});

export const ENV = validateEnv(DISCOVERY_ENV_SCHEMA);
