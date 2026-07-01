import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const MessageManagerEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape).extend({
  // ── Redis ─────────────────────────────────────────────────────────────
  REDIS_URL: z.string().optional(),
  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().int().positive().default(6379),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().int().min(0).default(0),
  REDIS_TLS_ENABLED: z
    .string()
    .default('false')
    .transform(v => v === 'true' || v === '1'),
  REDIS_SENTINEL_MASTER_NAME: z.string().optional(),
  REDIS_SENTINEL_NODES: z.string().optional(),
  REDIS_SENTINEL_PASSWORD: z.string().optional(),
  REDIS_CLUSTER_NODES: z.string().optional(),
  REDIS_PREFIX: z.string().default('mm:'),
  REDIS_MAX_RECONNECT_ATTEMPTS: z.coerce.number().int().min(0).default(10),
  REDIS_STREAM_MAXLEN: z.coerce.number().int().positive().default(10000),
  REDIS_MESSAGE_TTL_S: z.coerce.number().int().positive().default(86400),

  // ── DLQ ──────────────────────────────────────────────────────────────
  DLQ_AUTH_HMAC_SECRET: z.string().optional(),
  DLQ_SERVICE_URL: z.string().optional(),
  DLQ_LOCAL_FALLBACK_PATH: z.string().default('./dead-letter-queue.jsonl'),

  // ── Message store ────────────────────────────────────────────────────
  MAX_PAYLOAD_BYTES: z.coerce.number().int().positive().default(1_048_576),
  MEMORY_WAL_BUFFER_SIZE: z.coerce.number().int().positive().default(1000),
  MEMORY_WAL_BUFFER_WARN_PCT: z.coerce.number().min(0).max(1).default(0.8),

  // ── Stale subscription detection ─────────────────────────────────────
  STALE_HEARTBEAT_INTERVAL_MS: z.coerce.number().int().positive().default(10_000),
  STALE_MISSED_HEARTBEAT_THRESHOLD: z.coerce.number().int().positive().default(3),
  STALE_GRACE_PERIOD_MS: z.coerce.number().int().positive().default(30_000),

  // ── OpenTelemetry ────────────────────────────────────────────────────
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().optional(),
  BROKER_INSTANCE_ID: z.string().default('message-manager-1'),

  // ── Mongo archive ────────────────────────────────────────────────────
  MONGO_ARCHIVE_URI: z.string().optional(),
  MONGO_ARCHIVE_DB: z.string().default('message_archive'),
  MONGO_ARCHIVE_COLLECTION: z.string().default('archived_messages'),
  MONGO_ARCHIVE_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  MONGO_ARCHIVE_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  MONGO_ARCHIVE_RETENTION_DAYS: z.coerce.number().int().positive().default(30),
});

/** Runtime environment variables validated against the extended message-manager schema. */
export const env = validateEnv(MessageManagerEnvSchema);

/** Inferred shape of the validated message-manager environment. */
export type Env = z.infer<typeof MessageManagerEnvSchema>;
