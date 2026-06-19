import { createPublicKey, createSign } from 'node:crypto';

import { KeyPair } from './types';

export function parseKey(privateKey: string): KeyPair {
  const publicKey = createPublicKey(privateKey).export({ type: 'spki', format: 'pem' });
  return { publicKey, privateKey };
}

export function sign(algorithm: string, body: string, privateKey: string): string {
  const sign = createSign(algorithm);
  sign.update(body);
  return sign.sign(privateKey, 'base64');
}
