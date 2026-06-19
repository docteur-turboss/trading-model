import { createPublicKey, X509Certificate } from 'node:crypto';

import forge from 'node-forge';

export function chunks(str: string, size: number): string[] {
  const result: string[] = [];
  for (let i = 0; i < str.length; i += size) {
    result.push(str.slice(i, i + size));
  }
  return result;
}

/** @deprecated Use X509Certificate for parsing certificates. */
export function parsePem<T = unknown>(_pem: string): T {
  throw new Error('parsePem is deprecated — use X509Certificate or certificationRequestFromPem');
}

/** @deprecated Use X509Certificate.publicKey instead. */
export function extractPublicKeyFromBody(_body: string): string | null {
  throw new Error('extractPublicKeyFromBody is deprecated');
}

export function resolvePublicKey(issuerCert: string): ReturnType<typeof createPublicKey> {
  return createPublicKey(issuerCert);
}

export function parseCertInfo(pem: string): {
  subject: string;
  issuer: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  san: string[];
} {
  const x509 = new X509Certificate(pem);
  const forgeCert = forge.pki.certificateFromPem(pem);
  return {
    subject: x509.subject,
    issuer: x509.issuer,
    serialNumber: forgeCert.serialNumber,
    notBefore: new Date(x509.validFrom),
    notAfter: new Date(x509.validTo),
    fingerprint: x509.fingerprint256.replace(/:/g, '').toLowerCase(),
    san: (x509.subjectAltName ?? '')
      .split(', ')
      .filter(s => s.startsWith('DNS:'))
      .map(s => s.slice(4)),
  };
}

import { createPrivateKey } from 'node:crypto';

export function privateKeyFromPem(pem: string): forge.pki.PrivateKey {
  const keyObject = createPrivateKey(pem);
  const keyType = keyObject.asymmetricKeyType;
  if (keyType === 'ec') {
    const sec1 = keyObject.export({ type: 'sec1', format: 'pem' });
    return forge.pki.privateKeyFromPem(sec1);
  }
  const pkcs1 = keyObject.export({ type: 'pkcs1', format: 'pem' });
  return forge.pki.privateKeyFromPem(pkcs1);
}

export function parseCsrInfo(csrPem: string): {
  commonName: string;
  san: string[];
  publicKeyPem: string;
} {
  const csr = forge.pki.certificationRequestFromPem(csrPem);
  const cn = csr.subject.getField('CN')?.value ?? '';
  const sanAttr = csr.getAttribute({ name: 'extensionRequest' });
  const san: string[] = [];
  if (sanAttr && (sanAttr as any).extensions) {
    for (const ext of (sanAttr as any).extensions as any[]) {
      if (ext.name === 'subjectAltName' && ext.altNames) {
        for (const alt of ext.altNames) {
          if (alt.type === 2) san.push(alt.value as string);
        }
      }
    }
  }
  const publicKeyPem = csr.publicKey ? forge.pki.publicKeyToPem(csr.publicKey) : '';
  return { commonName: cn, san, publicKeyPem };
}
