import {
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/common/validation/env";
import { z } from "zod";

const CA_ENV_DEFS = [
	[
		"MONGODB_URI",
		z.string().url().default("mongodb://mongo:27017/certificate-authority"),
	],
	["CA_KEY_PATH", z.string().min(1).default("/etc/ca-keys/ca-key.pem")],
	["CA_CERT_TTL_MS", z.coerce.number().int().positive().default(31536000000)],
	[
		"CERT_ROTATION_INTERVAL_MS",
		z.coerce.number().int().positive().default(86400000),
	],
	[
		"CERT_ROTATION_MARGIN_MS",
		z.coerce.number().int().positive().default(17280000),
	],
	[
		"CERT_DEFAULT_TTL_MS",
		z.coerce.number().int().positive().default(604800000),
	],
	["CERT_MAX_TTL_MS", z.coerce.number().int().positive().default(31536000000)],
	[
		"DISCOVERY_SERVICE_URL",
		z.string().url().default("https://discovery-server:3000"),
	],
] as const satisfies readonly (readonly [string, z.ZodTypeAny])[];

const CA_ENV_SHAPE = Object.fromEntries(CA_ENV_DEFS) as Record<
	string,
	z.ZodTypeAny
>;

const CERTIFICATE_AUTHORITY_ENV_SCHEMA = BaseEnvSchema.extend(CA_ENV_SHAPE);

export type CertificateAuthorityEnv = z.infer<
	typeof CERTIFICATE_AUTHORITY_ENV_SCHEMA
>;

export const ENV = validateEnv(CERTIFICATE_AUTHORITY_ENV_SCHEMA);
