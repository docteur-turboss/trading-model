import { z } from 'zod';

import {
  BaseEnvSchema,
  AddressManagerEnvSchema,
  validateEnv,
} from '@trading-model/common/validation/env';

const MessageManagerEnvSchema = BaseEnvSchema.extend(AddressManagerEnvSchema.shape);

/** Runtime environment variables validated against the extended message-manager schema. */
export const env = validateEnv(MessageManagerEnvSchema);

/** Inferred shape of the validated message-manager environment. */
export type Env = z.infer<typeof MessageManagerEnvSchema>;
