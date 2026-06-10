import { z } from 'zod';

import { BaseEnvSchema, validateEnv } from '@trading-model/common/validation/env';

const CertificateAuthorityEnvSchema = BaseEnvSchema.extend({
  MONGODB_URI: z.string().url().default('mongodb://mongo:27017/certificate-authority'),

  CA_KEY_PATH: z.string().min(1).default('/etc/ca-keys/ca-key.pem'),

  CA_CERT_TTL_MS: z.coerce.number().int().positive().default(31536000000),

  CERT_ROTATION_INTERVAL_MS: z.coerce.number().int().positive().default(86400000),

  CERT_ROTATION_MARGIN_MS: z.coerce.number().int().positive().default(17280000),

  CERT_DEFAULT_TTL_MS: z.coerce.number().int().positive().default(604800000),

  DISCOVERY_SERVICE_URL: z.string().url().default('https://discovery-server:3000'),
});

export type CertificateAuthorityEnv = z.infer<typeof CertificateAuthorityEnvSchema>;

export const env = validateEnv(CertificateAuthorityEnvSchema);
