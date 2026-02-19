import { z } from "zod";

/**
 * Environment variables schema definition.
 *
 * This schema validates and parses all required environment variables
 * at application startup. The application must fail fast if the
 * configuration is invalid.
 */
const envSchema = z.object({
  /**
   * Application environment
   * Determines runtime behavior and defaults.
   */
  NODE_ENV: z
    .enum(["development", "test", "staging", "production"])
    .default("development"),

  /**
   * Application network configuration
   */
  APP_NAME: z.string().min(1),
  APP_VERSION: z.string().default("1.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),

  /**
   * Certificate / security configuration
   */
  TLS_KEY_PATH: z.string().min(1),
  TLS_CERT_PATH: z.string().min(1),
  TLS_CA_PATH: z.string().min(1),

  /**
   * Service identity (used for service discovery, auth, tracing, etc.)
   */
  SERVICE_NAME: z.string().min(1),
  INSTANCE_ID: z.string().min(1),
  CACHE_TTL_MS: z.number().int().positive().default(30000),
  SERVICE_PING_TIMEOUT_MS: z.number().int().positive().default(2000),
  TOKEN_REFRESH_INTERVAL_MS: z.number().int().positive().default(60000),
  TTL_REFRESH_INTERVAL_MS: z.number().int().positive().default(15000),

  /**
   * Broker services
   */
  MESSAGE_BUS_INIT_TIMEOUT_MS: z.number().int().positive().default(2000),
  MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: z.number().int().positive().default(2000),

  /**
   * External services
   */
  ADDRESS_MANAGER_URL: z.url(),
  ERROR_URL_WEBHOOK: z.url(),
  MESSAGE_CALLBACK_PATH: z.string().min(1).default("message"),

  /**
   * Observability
   */
  LOG_LEVEL: z
    .enum(["error", "warn", "info", "debug"])
    .default("info"),
});

/**
 * Parses and validates process.env using the schema above.
 * The application will crash immediately if validation fails.
 */
const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error("❌ Invalid environment configuration", {
    errors: z.treeifyError(parsedEnv.error),
  });
  process.exit(1);
}

/**
 * Strongly typed and validated environment configuration.
 *
 * This object should be the single source of truth
 * for accessing environment variables in the application.
 */
export const env = parsedEnv.data;

/**
 * Exported type for dependency injection and testing.
 */
export type Env = z.infer<typeof envSchema>;