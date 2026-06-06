import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const FinancialScrapperEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape);

export const env = validateEnv(FinancialScrapperEnvSchema);

export type Env = z.infer<typeof FinancialScrapperEnvSchema>;
