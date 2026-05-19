import { z } from 'zod';
import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const MessageManagerEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape);

export const env = validateEnv(MessageManagerEnvSchema);

export type Env = z.infer<typeof MessageManagerEnvSchema>;
