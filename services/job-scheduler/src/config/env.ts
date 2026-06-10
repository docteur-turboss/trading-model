import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const JobSchedulerEnvSchema = BaseEnvSchema.extend({
  ...AddressManagerEnvSchema.shape,
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/job-scheduler'),
  MAX_QUEUE_DEPTH: z.coerce.number().int().positive().default(10000),
  MAX_WORKER_LOAD_RATIO: z.coerce.number().min(0).max(1).default(0.85),
  ACK_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MAX_RETRIES_PER_JOB: z.coerce.number().int().min(0).default(3),
  ORPHAN_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  WORKER_HEARTBEAT_TTL_MS: z.coerce.number().int().positive().default(30000),
});

export const env = validateEnv(JobSchedulerEnvSchema);

export type Env = z.infer<typeof JobSchedulerEnvSchema>;
