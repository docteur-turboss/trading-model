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
  CLEANUP_SERVICE_INTERVAL_MS: z.coerce.number().int().positive().default(1_000*60*10),

  ERROR_URL_WEBHOOK: z.url(),

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