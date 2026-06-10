import { z } from 'zod';

import { BaseEnvSchema, validateEnv } from '@trading-model/common/validation/env';

const ApiGatewayEnvSchema = BaseEnvSchema.extend({
  DISCOVERY_SERVICE_URL: z.string().url().default('https://discovery-server:3000'),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60000),

  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),

  CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),

  AUTH_TOKEN_HEADER: z.string().default('x-api-key'),

  AUTH_TOKENS: z.string().default(''),

  PROXY_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
});

export type ApiGatewayEnv = z.infer<typeof ApiGatewayEnvSchema>;

export const env = validateEnv(ApiGatewayEnvSchema);
