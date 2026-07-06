export interface CertificateRequest {
	serviceId: string;
	csr: string;
	ttlMs: number;
}

import type { CertificateBase } from "@trading-model/common/domain/certificate-base";

export interface SignedCertificate extends CertificateBase {
	serviceId: string;
	issuedAt: Date;
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

export type KeyPairWithId = KeyPair & { id: string };

export interface CertificateInfo {
	serialNumber: string;
	subject: string;
	issuer: string;
	notBefore: Date;
	notAfter: Date;
	fingerprint: string;
	san: string[];
}
