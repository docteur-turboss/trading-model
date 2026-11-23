import { BaseEnvSchema } from "@trading-model/http/config/env";
import { weakSecretReason } from "@trading-model/http/config/secret-strength";
import { validateEnv } from "@trading-model/http/config/validate-env";
import { RedisEnvSchema } from "@trading-model/persistence/redis-env";
import { DEFAULT_PRIVATE_CIDRS } from "@trading-model/primitives/primitives";
import { z } from "zod";

const DISCOVERY_EXTRA = {
	CLEANUP_SERVICE_INTERVAL_MS: z.coerce
		.number()
		.int()
		.positive()
		.default(1_000 * 60 * 10),
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
		// In memory, each replica would keep its own registry and tokens.
		if (
			data.NODE_ENV === "production" &&
			!data.REDIS_URL &&
			!data.REDIS_SENTINELS
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"REDIS_URL or REDIS_SENTINELS is required in production: the registry is shared by the replicas in Redis",
				path: ["REDIS_SENTINELS"],
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
		const weak =
			data.NODE_ENV === "production" && data.SIGNING_SECRET
				? weakSecretReason(data.SIGNING_SECRET)
				: undefined;
		if (weak) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `SIGNING_SECRET ${weak}`,
				path: ["SIGNING_SECRET"],
			});
		}
	});

export const ENV = validateEnv(DISCOVERY_ENV_SCHEMA);
