import { createSign, createPublicKey } from 'node:crypto';

export interface CsrOptions {
  commonName: string;
  san: string[];
  keyPem: string;
}

export function createCsr(options: CsrOptions): string {
  const { commonName, san, keyPem } = options;

  const publicKey = createPublicKey(keyPem);

  const sanExtension = san.map(dns => `DNS:${dns}`).join(',');

  const csrData = [
    `-----BEGIN CERTIFICATE REQUEST-----`,
    `CN=${commonName}`,
    `SAN=${sanExtension}`,
    `-----END CERTIFICATE REQUEST-----`,
  ].join('\n');

  const sign = createSign('sha256');
  sign.update(csrData);
  const signature = sign.sign(keyPem, 'base64');

  const csrBody = Buffer.from(
    JSON.stringify({
      commonName,
      san,
      publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
      signature,
    })
  ).toString('base64');

  return [
    `-----BEGIN CERTIFICATE REQUEST-----`,
    ...chunks(csrBody, 64),
    `-----END CERTIFICATE REQUEST-----`,
  ].join('\n');
}

function chunks(str: string, size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    result.push(str.slice(i, i + size));
  }
  return result;
}
