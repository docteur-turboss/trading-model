import {
	BaseEnvSchema,
	validateEnv,
} from "@trading-model/common/validation/env";
import { z } from "zod";

const API_GATEWAY_ENV_SHAPE = {
	DISCOVERY_SERVICE_URL: z
		.string()
		.url()
		.default("https://discovery-server:3000"),
	RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),
	RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
	CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
	AUTH_TOKEN_HEADER: z.string().default("x-api-key"),
	AUTH_TOKENS: z.string().default(""),
	PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
} satisfies Record<string, z.ZodTypeAny>;

const API_GATEWAY_ENV_SCHEMA = BaseEnvSchema.extend(API_GATEWAY_ENV_SHAPE);

export type ApiGatewayEnv = z.infer<typeof API_GATEWAY_ENV_SCHEMA>;

export const ENV = validateEnv(API_GATEWAY_ENV_SCHEMA);
