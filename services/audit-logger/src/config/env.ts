import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const AuditLoggerEnvSchema = BaseEnvSchema.extend({
  ...AddressManagerEnvSchema.shape,
  MONGODB_URI: z.string().url().default('mongodb://localhost:27017/audit-logger'),
  MAX_QUEUE_DEPTH: z.coerce.number().int().positive().default(10000),
  MAX_WORKER_LOAD_RATIO: z.coerce.number().min(0).max(1).default(0.85),
  ACK_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
  MAX_RETRIES_PER_JOB: z.coerce.number().int().min(0).default(3),
  ORPHAN_SCAN_INTERVAL_MS: z.coerce.number().int().positive().default(10000),
  WORKER_HEARTBEAT_TTL_MS: z.coerce.number().int().positive().default(30000),
  GAP_DETECTION_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  LOG_RETENTION_DAYS: z.coerce.number().int().positive().default(1827),
  AUDIT_RETENTION_DAYS: z.coerce.number().int().positive().default(90),
});

export const env = validateEnv(AuditLoggerEnvSchema);

export type Env = z.infer<typeof AuditLoggerEnvSchema>;
