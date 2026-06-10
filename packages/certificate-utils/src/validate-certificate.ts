import { createVerify, createPublicKey } from 'node:crypto';

export interface ValidationResult {
  valid: boolean;
  reason?: string;
}

export function validateCertificate(certPem: string, _caCertPem: string): ValidationResult {
  try {
    const certData = parseCert(certPem);

    const now = new Date();
    const notAfter = new Date(certData.body.match(/Not After: (.+)/)?.[1] ?? '');
    const notBefore = new Date(certData.body.match(/Not Before: (.+)/)?.[1] ?? '');

    if (now < notBefore) {
      return { valid: false, reason: 'Certificate not yet valid' };
    }
    if (now > notAfter) {
      return { valid: false, reason: 'Certificate expired' };
    }

    const caKey = createPublicKey(certData.issuerCert);
    const verify = createVerify('sha256');
    verify.update(certData.body);
    const isValid = verify.verify(caKey, certData.signature, 'base64');

    return isValid ? { valid: true } : { valid: false, reason: 'Signature verification failed' };
  } catch (err) {
    return { valid: false, reason: `Validation error: ${(err as Error).message}` };
  }
}

function parseCert(certPem: string): {
  body: string;
  signature: string;
  issuerCert: string;
} {
  const lines = certPem.split('\n').filter(l => !l.includes('BEGIN') && !l.includes('END'));
  const decoded = Buffer.from(lines.join(''), 'base64').toString('utf8');
  return JSON.parse(decoded);
}
