export interface CertificateEntry {
  id: string;
  commonName: string;
  fingerprint: string;
  expiresAt: string;
  status: 'valid' | 'expiring' | 'revoked';
  issuer: string;
}
