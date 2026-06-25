import { createHash } from 'node:crypto';

import { CertificateInfo } from './types';

export function certificateInfo(certPem: string): CertificateInfo {
  const lines = certPem
    .split('\n')
    .filter(l => !l.startsWith('-----BEGIN') && !l.startsWith('-----END'));
  const decoded = Buffer.from(lines.join(''), 'base64').toString('utf8');
  const parsed = JSON.parse(decoded);
  const body = parsed.body as string;

  return {
    serialNumber: body.match(/Serial: (.+)/)?.[1] ?? '',
    subject: body.match(/Subject: (.+)/)?.[1] ?? '',
    issuer: body.match(/Issuer: (.+)/)?.[1] ?? '',
    notBefore: new Date(body.match(/Not Before: (.+)/)?.[1] ?? ''),
    notAfter: new Date(body.match(/Not After: (.+)/)?.[1] ?? ''),
    fingerprint: createHash('sha256').update(certPem).digest('hex'),
    san: (body.match(/SAN: (.+)/)?.[1] ?? '').split(', ').filter(Boolean),
  };
}
