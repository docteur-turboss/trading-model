import { z } from 'zod';

export const BaseEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  TLS_KEY_PATH: z.string().min(1),
  TLS_CERT_PATH: z.string().min(1),
  TLS_CA_PATH: z.string().min(1),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
});

export type BaseEnv = z.infer<typeof BaseEnvSchema>;

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
  ERROR_URL_WEBHOOK: z.url(),
  MESSAGE_BUS_INIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MESSAGE_CALLBACK_PATH: z.string().min(1).default('message'),
});

export type AddressManagerEnv = z.infer<typeof AddressManagerEnvSchema>;

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
    console.error('❌ Invalid environment configuration', { errors });
    process.exit(1);
  }

  return parsed.data;
}
