import { z } from 'zod';

import { ConfigurationError } from '../utils/errors';

/** Zod schema for base environment variables shared across all services. */
export const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  TLS_KEY_PATH: z.string().min(1),
  TLS_CERT_PATH: z.string().min(1),
  TLS_CA_PATH: z.string().min(1),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

/** Inferred type for validated base environment variables. */
export type BaseEnv = z.infer<typeof BaseEnvSchema>;

/** Zod schema for address manager service environment variables. */
export const AddressManagerEnvSchema = z.object({
  APP_NAME: z.string().min(1),
  APP_VERSION: z.string().default('1.0.0'),
  SERVICE_NAME: z.string().min(1),
  INSTANCE_ID: z.string().min(1),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
  SERVICE_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  TOKEN_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  TTL_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  ADDRESS_MANAGER_URL: z.url(),
  ERROR_URL_WEBHOOK: z.union([z.string().url(), z.literal('')]).default(''),
  MESSAGE_BUS_INIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MESSAGE_CALLBACK_PATH: z.string().min(1).default('message'),

  /**
   * Optional JSON mapping from logical service names to deployment-specific DNS names.
   * Parsed safely — invalid JSON or non-object values fall back to `{}`.
   * @example '{"discovery-service":"discovery-server","message-delivery-service":"message-manager"}'
   */
  DNS_NAME_MAP: z
    .string()
    .optional()
    .default('{}')
    .transform(val => {
      try {
        const parsed = JSON.parse(val);
        return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
          ? (parsed as Record<string, string>)
          : {};
      } catch {
        return {};
      }
    }),
});

/** Inferred type for validated address manager environment variables. */
export type AddressManagerEnv = z.infer<typeof AddressManagerEnvSchema>;

/**
 * Validates environment variables against a Zod schema.
 *
 * @throws {ConfigurationError} When validation fails — callers should handle
 * this at the application boundary (e.g. exit with a clear message).
 */
export function validateEnv<T extends z.ZodType>(schema: T): z.infer<T> {
  const parsed = schema.safeParse(process.env);

  if (!parsed.success) {
    let errors: unknown = parsed.error;
    if (typeof z.treeifyError === 'function') {
      try {
        errors = z.treeifyError(parsed.error);
      } catch {
        /* fallback */
      }
    }
    console.error('Invalid environment configuration', { errors });
    throw new ConfigurationError('Environment validation failed', parsed.error);
  }

  return parsed.data;
}
