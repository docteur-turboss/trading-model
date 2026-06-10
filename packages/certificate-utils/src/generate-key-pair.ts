import { generateKeyPairSync } from 'node:crypto';

import { KeyPair } from './types';

export const KeyAlgorithm = {
  RSA_4096: 'rsa',
  EC_P384: 'ec',
} as const;

export type KeyAlgorithm = (typeof KeyAlgorithm)[keyof typeof KeyAlgorithm];

export function generateKeyPair(algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384): KeyPair {
  const algorithmOptions: Record<string, unknown> =
    algorithm === KeyAlgorithm.RSA_4096 ? { modulusLength: 4096 } : { namedCurve: 'P-384' };

  const { publicKey, privateKey } = (
    generateKeyPairSync as (
      type: string,
      options: Record<string, unknown>
    ) => { publicKey: unknown; privateKey: unknown }
  )(algorithm, {
    ...algorithmOptions,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  return {
    publicKey: publicKey as string,
    privateKey: privateKey as string,
  };
}
