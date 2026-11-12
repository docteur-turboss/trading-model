import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { RedisEnvSchema } from "@trading-model/validation/config/redis-env";
import { z } from "zod";

const DlqEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape)
	.extend(RedisEnvSchema.shape)
	.extend({
		MONGO_URI: z.string().default("mongodb://localhost:27017"),
		/** The `dlq-service` MongoDB user (issue #669); unset: no authentication (dev). */
		MONGO_USERNAME: z.string().min(1).optional(),
		MONGO_PASSWORD: z.string().min(1).optional(),
		MONGO_DB: z.string().default("dlq"),
		MONGO_COLLECTION: z.string().default("dlq_entries"),
		MAX_ENTRIES: z.coerce.number().int().positive().default(100000),
		DLQ_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
		MESSAGE_MANAGER_URL: z.string().optional(),
		DLQ_AUTH_HMAC_SECRET: z
			.string()
			.min(16, "DLQ_AUTH_HMAC_SECRET must be at least 16 characters")
			.optional(),
		DLQ_ALLOWED_SERVICES: z.string().default("message-manager,admin"),
		DLQ_PRUNE_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
		DLQ_AUTO_RETRY_ENABLED: z
			.string()
			.default("false")
			.transform((value) => value === "true" || value === "1"),
		DLQ_AUTO_RETRY_INTERVAL_MS: z.coerce
			.number()
			.int()
			.positive()
			.default(30_000),
		DLQ_AUTO_RETRY_LIMIT: z.coerce
			.number()
			.int()
			.positive()
			.max(100)
			.default(50),
	});

export const ENV = validateEnv(DlqEnvSchema);
export type Env = z.infer<typeof DlqEnvSchema>;

const secretCache: { value: string | null } = { value: null };

export function resolveAuthHmacSecret(): string {
	if (secretCache.value) {
		return secretCache.value;
	}
	if (ENV.DLQ_AUTH_HMAC_SECRET) {
		secretCache.value = ENV.DLQ_AUTH_HMAC_SECRET;
		return ENV.DLQ_AUTH_HMAC_SECRET;
	}
	throw new Error("DLQ_AUTH_HMAC_SECRET is required");
}
