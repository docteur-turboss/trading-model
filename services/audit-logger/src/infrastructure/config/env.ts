import { validateEnv } from "@trading-model/validation/application/services/validate-env";
import { AddressManagerEnvSchema } from "@trading-model/validation/config/address-manager-env";
import { BaseEnvSchema } from "@trading-model/validation/config/env";
import { z } from "zod";
import { MongoUriSchema } from "./mongo-uri";

const AUDIT_LOGGER_ENV_SHAPE = {
	MONGODB_URI: MongoUriSchema.default("mongodb://localhost:27017/audit-logger"),
	AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(1827),
	/** Verification + anchoring cycle of the audit chain (ADR-0027). */
	AUDIT_CHAIN_INTERVAL_MS: z.coerce.number().int().positive().default(900_000),
	/** S3 bucket with Object Lock holding the chain anchors; unset: no anchors. */
	AUDIT_ANCHOR_BUCKET: z.string().min(1).optional(),
	AUDIT_ANCHOR_PREFIX: z.string().default("audit-chain/"),
	AUDIT_ANCHOR_REGION: z.string().default("us-east-1"),
	/** S3-compatible endpoint (MinIO, Scaleway...); unset: AWS. */
	AUDIT_ANCHOR_ENDPOINT: z.url().optional(),
	/** Refuse to start without an anchor store (production). */
	AUDIT_ANCHOR_REQUIRED: z
		.string()
		.default("false")
		.transform((value) => value === "true" || value === "1"),
};

const AUDIT_LOGGER_ENV_SCHEMA = BaseEnvSchema.extend(
	AddressManagerEnvSchema.shape
).extend(AUDIT_LOGGER_ENV_SHAPE);

export type Env = z.infer<typeof AUDIT_LOGGER_ENV_SCHEMA>;

export const ENV = validateEnv(AUDIT_LOGGER_ENV_SCHEMA);
