import {
	AddressManagerEnvSchema,
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/common/validation/env";
import { z } from "zod";

function envKey(name: string): string {
	return name;
}

const envShape: Record<string, z.ZodTypeAny> = {};
envShape[envKey("MONGODB_URI")] = z
	.string()
	.url()
	.default("mongodb://localhost:27017/audit-logger");
envShape[envKey("MAX_QUEUE_DEPTH")] = z.coerce
	.number()
	.int()
	.positive()
	.default(10000);
envShape[envKey("MAX_WORKER_LOAD_RATIO")] = z.coerce
	.number()
	.min(0)
	.max(1)
	.default(0.85);
envShape[envKey("ACK_TIMEOUT_MS")] = z.coerce
	.number()
	.int()
	.positive()
	.default(30000);
envShape[envKey("MAX_RETRIES_PER_JOB")] = z.coerce
	.number()
	.int()
	.min(0)
	.default(3);
envShape[envKey("ORPHAN_SCAN_INTERVAL_MS")] = z.coerce
	.number()
	.int()
	.positive()
	.default(10000);
envShape[envKey("WORKER_HEARTBEAT_TTL_MS")] = z.coerce
	.number()
	.int()
	.positive()
	.default(30000);
envShape[envKey("GAP_DETECTION_INTERVAL_MS")] = z.coerce
	.number()
	.int()
	.positive()
	.default(60000);
envShape[envKey("LOG_RETENTION_DAYS")] = z.coerce
	.number()
	.int()
	.positive()
	.default(1827);
envShape[envKey("AUDIT_RETENTION_DAYS")] = z.coerce
	.number()
	.int()
	.positive()
	.default(90);

const AUDIT_LOGGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
).extend(envShape);

export const ENV = validateEnv(AUDIT_LOGGER_ENV_SCHEMA) as unknown as Env;

const envFields = [
	"MONGODB_URI",
	"MAX_QUEUE_DEPTH",
	"MAX_WORKER_LOAD_RATIO",
	"ACK_TIMEOUT_MS",
	"MAX_RETRIES_PER_JOB",
	"ORPHAN_SCAN_INTERVAL_MS",
	"WORKER_HEARTBEAT_TTL_MS",
	"GAP_DETECTION_INTERVAL_MS",
	"LOG_RETENTION_DAYS",
	"AUDIT_RETENTION_DAYS",
] as const;

type CustomEnvFields = {
	[Key in (typeof envFields)[number]]: Key extends "MONGODB_URI"
		? string
		: number;
};

export type Env = z.infer<typeof BaseEnvSchema> &
	z.infer<typeof AddressManagerEnvSchema> &
	CustomEnvFields;
