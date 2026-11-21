import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { validateEnv } from "@trading-model/validation/config/validate-env";
import { z } from "zod";

const MESSAGE_MANAGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
)
	.extend(RedisEnvSchema.shape)
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
	});

export const ENV = validateEnv(MESSAGE_MANAGER_ENV_SCHEMA);
