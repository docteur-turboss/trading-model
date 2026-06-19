import { z } from 'zod';

import {
  BaseEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const CryptoWorkerEnvSchema = BaseEnvSchema.extend({
  WORKER_POOL_SIZE: z.coerce.number().int().positive().default(0),
  WORKER_MAX_QUEUE: z.coerce.number().int().positive().default(500),
});

export type CryptoWorkerEnv = z.infer<typeof CryptoWorkerEnvSchema>;

export const env = validateEnv(CryptoWorkerEnvSchema);
