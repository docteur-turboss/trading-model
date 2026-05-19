import { z } from 'zod';

const TraderTrainerEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  TLS_KEY_PATH: z.string().min(1),
  TLS_CERT_PATH: z.string().min(1),
  TLS_CA_PATH: z.string().min(1),

  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  APP_NAME: z.string().min(1),
  APP_VERSION: z.string().default('1.0.0'),
  SERVICE_NAME: z.string().min(1),
  INSTANCE_ID: z.string().min(1),
  CACHE_TTL_MS: z.coerce.number().int().positive().default(30000),
  SERVICE_PING_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  TOKEN_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60000),
  TTL_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(15000),
  ADDRESS_MANAGER_URL: z.string(),
  ERROR_URL_WEBHOOK: z.string(),
  MESSAGE_BUS_INIT_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MESSAGE_BUS_SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().positive().default(2000),
  MESSAGE_CALLBACK_PATH: z.string().min(1).default('message'),

  TRAINER_SYMBOLS: z.string().default('BTCUSDT,ETHUSDT'),
  TRAINER_DATA_WINDOW: z.coerce.number().int().positive().default(500),
  TRAINER_VALIDATION_SPLIT: z.coerce.number().min(0).max(1).default(0.2),
  TRAINER_GENERATIONS: z.coerce.number().int().positive().default(50),
  TRAINER_POPULATION_SIZE: z.coerce.number().int().positive().default(20),
  TRAINER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(300000),
  TRAINER_EPISODES_PER_INDIVIDUAL: z.coerce.number().int().positive().default(3),
});

export type Env = z.infer<typeof TraderTrainerEnvSchema>;

function loadEnv(): Env {
  const parsed = TraderTrainerEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const errors = parsed.error instanceof Error ? parsed.error.message : String(parsed.error);
    console.error('Invalid environment configuration', { errors });
    process.exit(1);
  }
  return parsed.data;
}

export const env = loadEnv();
