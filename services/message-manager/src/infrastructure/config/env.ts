import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { z } from "zod";

const MM_EXTRA_SHAPE = {
	// Dead-lettered messages (JSON Lines) dlq-service could not take yet.
	// K8s mounts a writable volume there: the root filesystem is read-only.
	DLQ_LOCAL_FALLBACK_PATH: z
		.string()
		.min(1)
		.default("./dead-letter-queue.jsonl"),
	// Signs the dead letters sent to dlq-service (shared with it). Empty means
	// unset: dead letters then stay in DLQ_LOCAL_FALLBACK_PATH.
	DLQ_AUTH_HMAC_SECRET: z.preprocess(
		(value) => (value === "" ? undefined : value),
		z
			.string()
			.min(16, "DLQ_AUTH_HMAC_SECRET must be at least 16 characters")
			.optional()
	),
	// How often dead letters kept in the file are sent to dlq-service again.
	DLQ_FORWARD_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
} satisfies Record<string, z.ZodTypeAny>;

const MESSAGE_MANAGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
)
	.extend(RedisEnvSchema.shape)
	.extend(MM_EXTRA_SHAPE)
	.superRefine((data, ctx) => {
		// Without it dead letters sit in a pod-local file nobody replays.
		if (data.NODE_ENV === "production" && !data.DLQ_AUTH_HMAC_SECRET) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				message:
					"DLQ_AUTH_HMAC_SECRET is required in production: dead letters go to dlq-service",
				path: ["DLQ_AUTH_HMAC_SECRET"],
			});
		}
	});

export const ENV = validateEnv(MESSAGE_MANAGER_ENV_SCHEMA);
