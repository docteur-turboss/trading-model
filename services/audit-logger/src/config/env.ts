import { AddressManagerEnvSchema } from "@trading-model/validation/validation/address-manager-env";
import {
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/validation/validation/env";
import { z } from "zod";

const AUDIT_LOGGER_ENV_SHAPE = {
	MONGODB_URI: z
		.string()
		.url()
		.default("mongodb://localhost:27017/audit-logger"),
	MAX_QUEUE_DEPTH: z.coerce.number().int().positive().default(10000),
	MAX_WORKER_LOAD_RATIO: z.coerce.number().min(0).max(1).default(0.85),
	ACK_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
	MAX_RETRIES_PER_JOB: z.coerce.number().int().min(0).default(3),
	ORPHAN_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
	WORKER_HEARTBEAT_TTL_MS: z.coerce.number().int().positive().default(30000),
	GAP_DETECTION_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
	LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(1827),
	AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
};

const AUDIT_LOGGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
).extend(AUDIT_LOGGER_ENV_SHAPE);

export type Env = z.infer<typeof BaseEnvSchema> &
	z.infer<typeof AddressManagerEnvSchema> &
	z.infer<z.ZodObject<typeof AUDIT_LOGGER_ENV_SHAPE>>;

export const ENV = validateEnv(AUDIT_LOGGER_ENV_SCHEMA) as unknown as Env;
