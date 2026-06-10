export interface CertificateRequest {
  serviceId: string;
  csr: string;
  ttlMs: number;
}

export interface SignedCertificate {
  serialNumber: string;
  certPem: string;
  caPem: string;
  serviceId: string;
  issuedAt: Date;
  expiresAt: Date;
  fingerprint: string;
}

export interface RevokedCertificate {
  serialNumber: string;
  serviceId: string;
  revokedAt: Date;
  reason: string;
}

export interface CaMetadata {
  id: string;
  caCertPem: string;
  createdAt: Date;
  expiresAt: Date;
  fingerprint: string;
}

export interface KeyPair {
  publicKey: string;
  privateKey: string;
}

export interface CertificateInfo {
  serialNumber: string;
  subject: string;
  issuer: string;
  notBefore: Date;
  notAfter: Date;
  fingerprint: string;
  san: string[];
}
