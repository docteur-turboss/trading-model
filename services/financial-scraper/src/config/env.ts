import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const FinancialScraperEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape).extend({
  BINANCE_API_KEY: z.string().default(''),

  BINANCE_API_SECRET: z.string().default(''),

  SYMBOLS_TO_TRACK: z
    .string()
    .default('[]')
    .transform(val => {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed.map(String) : [];
      } catch {
        return [];
      }
    }),

  SCRAPE_INTERVAL: z.string().default('*/1 * * * *'),

  DB_USER: z.string().default('root'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('financial_scraper'),
  DB_HOST: z.string().default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(3306),
});

export const env = validateEnv(FinancialScraperEnvSchema);

export type Env = z.infer<typeof FinancialScraperEnvSchema>;
