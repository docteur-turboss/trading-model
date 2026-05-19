import { z } from 'zod';
import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const TraderTrainerEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape).extend({
  TRAINER_SYMBOLS: z.string().default('BTCUSDT,ETHUSDT'),
  TRAINER_DATA_WINDOW: z.coerce.number().int().positive().default(500),
  TRAINER_VALIDATION_SPLIT: z.coerce.number().min(0).max(1).default(0.2),
  TRAINER_GENERATIONS: z.coerce.number().int().positive().default(50),
  TRAINER_POPULATION_SIZE: z.coerce.number().int().positive().default(20),
  TRAINER_TIME_BUDGET_MS: z.coerce.number().int().positive().default(300000),
  TRAINER_EPISODES_PER_INDIVIDUAL: z.coerce.number().int().positive().default(3),
});

export const env = validateEnv(TraderTrainerEnvSchema);

export type Env = z.infer<typeof TraderTrainerEnvSchema>;
