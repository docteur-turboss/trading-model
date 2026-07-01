import { readFileSync, existsSync } from 'node:fs';

import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const DlqEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape).extend({
  MONGO_URI: z.string().default('mongodb://localhost:27017'),
  MONGO_DB: z.string().default('dlq'),
  MONGO_COLLECTION: z.string().default('dlq_entries'),
  MAX_ENTRIES: z.coerce.number().int().positive().default(100000),
  DLQ_RETRY_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(100).default(5),
  MESSAGE_MANAGER_URL: z.string().optional(),
  DLQ_AUTH_HMAC_SECRET: z
    .string()
    .min(16, 'DLQ_AUTH_HMAC_SECRET must be at least 16 characters')
    .optional(),
  DLQ_AUTH_HMAC_SECRET_PATH: z.string().optional(),
  DLQ_ALLOWED_SERVICES: z.string().default('message-manager,admin'),
  DLQ_PRUNE_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  DLQ_AUTO_RETRY_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  DLQ_AUTO_RETRY_INTERVAL_MS: z.coerce.number().int().positive().default(30_000),
  DLQ_AUTO_RETRY_LIMIT: z.coerce.number().int().positive().max(100).default(50),
  REDIS_URL: z.string().optional(),
});

export const env = validateEnv(DlqEnvSchema);
export type Env = z.infer<typeof DlqEnvSchema>;

const secretCache: { value: string | null } = { value: null };

export function resolveAuthHmacSecret(): string {
  if (secretCache.value) return secretCache.value;

  const path = env.DLQ_AUTH_HMAC_SECRET_PATH;
  if (path) {
    try {
      if (existsSync(path)) {
        const value = readFileSync(path, 'utf8').trim();
        if (value.length >= 16) {
          secretCache.value = value;
          return value;
        }
      }
    } catch {
      // fall through to env var
    }
  }

  if (env.DLQ_AUTH_HMAC_SECRET) {
    secretCache.value = env.DLQ_AUTH_HMAC_SECRET;
    return env.DLQ_AUTH_HMAC_SECRET;
  }

  throw new Error('DLQ_AUTH_HMAC_SECRET is required (set env var or DLQ_AUTH_HMAC_SECRET_PATH)');
}
