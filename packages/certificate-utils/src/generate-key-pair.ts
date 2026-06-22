import { generateKeyPairSync as nodeGenerateKeyPairSync, randomUUID } from 'node:crypto';

import { KeyPair, KeyPairWithId } from './types';

export const KeyAlgorithm = {
  RSA_4096: 'rsa',
  EC_P384: 'ec',
} as const;

export type KeyAlgorithm = (typeof KeyAlgorithm)[keyof typeof KeyAlgorithm];

export function generateKeyPair(algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384): KeyPair {
  const algorithmOptions: Record<string, unknown> =
    algorithm === KeyAlgorithm.RSA_4096 ? { modulusLength: 4096 } : { namedCurve: 'P-384' };

  const { publicKey, privateKey } = (
    nodeGenerateKeyPairSync as (
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

export const generateKeyPairSync = generateKeyPair;

export function generateKeyPairWithId(
  algorithm: KeyAlgorithm = KeyAlgorithm.EC_P384
): KeyPairWithId {
  const pair = generateKeyPair(algorithm);
  return { ...pair, id: randomUUID() };
}

export const generateKeyPairWithIdSync = generateKeyPairWithId;
