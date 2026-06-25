import { createSign, createPublicKey, createHash, randomUUID } from 'node:crypto';

import { KeyPair, SignedCertificate } from './types';

export interface SignOptions {
  csr: string;
  serviceId: string;
  caKeyPair: KeyPair;
  caCertPem: string;
  ttlMs: number;
}

export function signCertificate(options: SignOptions): SignedCertificate {
  const { csr, serviceId, caKeyPair, caCertPem, ttlMs } = options;

  const csrData = parseCsr(csr);
  const publicKey = createPublicKey(csrData.publicKey);

  const serialNumber = randomUUID().replace(/-/g, '').substring(0, 16).toUpperCase();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMs);

  const certBody = [
    `Serial: ${serialNumber}`,
    `Issuer: CN=TradingModelCA`,
    `Subject: CN=${csrData.commonName}`,
    `Not Before: ${now.toISOString()}`,
    `Not After: ${expiresAt.toISOString()}`,
    `SAN: ${csrData.san.join(', ')}`,
    `Public Key: ${publicKey.export({ type: 'spki', format: 'pem' })}`,
  ].join('\n');

  const sign = createSign('sha256');
  sign.update(certBody);
  const signature = sign.sign(caKeyPair.privateKey, 'base64');

  const certPem = [
    `-----BEGIN CERTIFICATE-----`,
    ...chunks(
      Buffer.from(JSON.stringify({ body: certBody, signature, issuerCert: caCertPem })).toString(
        'base64'
      ),
      64
    ),
    `-----END CERTIFICATE-----`,
  ].join('\n');

  const fingerprint = createHash('sha256').update(certPem).digest('hex');

  return {
    serialNumber,
    certPem,
    caPem: caCertPem,
    serviceId,
    issuedAt: now,
    expiresAt,
    fingerprint,
  };
}

function parseCsr(csr: string): { commonName: string; san: string[]; publicKey: string } {
  const lines = csr
    .split('\n')
    .filter(l => !l.startsWith('-----BEGIN') && !l.startsWith('-----END'));
  const body = Buffer.from(lines.join(''), 'base64').toString('utf8');
  return JSON.parse(body);
}

function chunks(str: string, size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    result.push(str.slice(i, i + size));
  }
  return result;
}
