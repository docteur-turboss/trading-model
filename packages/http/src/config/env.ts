import { TlsEnvVarsSchema } from "@trading-model/common/config/tls-paths";
import { z } from "zod";
import { LogLevel } from "../log-types";
import { NODE_ENVS } from "../shared/node-env";

/** Zod schema for base environment variables shared across all services. */
export const BaseEnvSchema = z.object({
	NODE_ENV: z.enum(NODE_ENVS).default("development"),

	PORT: z.coerce.number().int().positive().default(3000),

	...TlsEnvVarsSchema.shape,

	/** Read by the global logger itself (`createLogger`, case-insensitive like here). */
	LOG_LEVEL: z
		.preprocess(
			(value) => (typeof value === "string" ? value.toLowerCase() : value),
			z.nativeEnum(LogLevel)
		)
		.default(LogLevel.Info),

	/** OTLP/HTTP collector base URL; unset: tracing off. */
	OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
});
