import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { weakSecretReason } from "@trading-model/validation/config/secret-strength";
import { validateEnv } from "@trading-model/validation/config/validate-env";
import { z } from "zod";

const MM_EXTRA_SHAPE = {
	// Signs the dead letters sent to dlq-service (shared with it). Empty means
	// unset: dead-lettering then fails and the entries stay in the journal.
	DLQ_AUTH_HMAC_SECRET: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z
			.string()
			.min(16, "DLQ_AUTH_HMAC_SECRET must be at least 16 characters")
			.optional()
	),
} satisfies Record<string, z.ZodTypeAny>;

const MESSAGE_MANAGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
)
	.extend(RedisEnvSchema.shape)
	.extend(MM_EXTRA_SHAPE)
	.superRefine((data, ctx) => {
		// Accepted messages live in the journal: in memory they die with the pod.
		if (
			data.NODE_ENV === "production" &&
			!data.REDIS_URL &&
			!data.REDIS_SENTINELS
		) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"REDIS_URL or REDIS_SENTINELS is required in production: accepted messages are kept in Redis",
				path: ["REDIS_SENTINELS"],
			});
		}
		// Dead letters are replayed by dlq-service, which needs the HMAC secret to authenticate them.
		if (data.NODE_ENV === "production" && !data.DLQ_AUTH_HMAC_SECRET) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"DLQ_AUTH_HMAC_SECRET is required in production: dead letters go to dlq-service",
				path: ["DLQ_AUTH_HMAC_SECRET"],
			});
		}
		const weak =
			data.NODE_ENV === "production" && data.DLQ_AUTH_HMAC_SECRET
				? weakSecretReason(data.DLQ_AUTH_HMAC_SECRET)
				: undefined;
		if (weak) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message: `DLQ_AUTH_HMAC_SECRET ${weak}`,
				path: ["DLQ_AUTH_HMAC_SECRET"],
			});
		}
	});

export const ENV = validateEnv(MESSAGE_MANAGER_ENV_SCHEMA);
