import { z } from 'zod';
import { BaseEnvSchema, validateEnv } from '@trading-model/common/validation/env';

const DiscoveryEnvSchema = BaseEnvSchema.extend({
  CLEANUP_SERVICE_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(1_000 * 60 * 10),
  ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal('')]).default(''),
});

/** Runtime environment variables validated against the extended discovery schema. */
export const env = validateEnv(DiscoveryEnvSchema);
