import { TlsEnvVarsSchema } from "@trading-model/common/config/tls-paths";
import { LogLevel } from "@trading-model/http/infrastructure/log-types";
import { NODE_ENVS } from "@trading-model/http/shared/node-env";
import { z } from "zod";

/** Zod schema for base environment variables shared across all services. */
export const BaseEnvSchema = z.object({
	NODE_ENV: z.enum(NODE_ENVS).default("development"),

	PORT: z.coerce.number().int().positive().default(3000),

	...TlsEnvVarsSchema.shape,

	LOG_LEVEL: z.nativeEnum(LogLevel).default(LogLevel.Info),
});

/** Inferred type for validated base environment variables. */
export type BaseEnv = z.infer<typeof BaseEnvSchema>;
