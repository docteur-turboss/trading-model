import type { Fingerprint, SerialNumber, ServiceId } from "@trading-model/common/domain/primitives";

export interface CertificateRequest {
	serviceId: ServiceId;
	csr: string;
	ttlMs: number;
}

import type { CertificateBase } from "@trading-model/common/domain/certificate-base";

export interface SignedCertificate extends CertificateBase {
	serviceId: ServiceId;
	issuedAt: Date;
	fingerprint: Fingerprint;
}

export interface RevokedCertificate {
	serialNumber: SerialNumber;
	serviceId: ServiceId;
	revokedAt: Date;
	reason: string;
}

export interface CaMetadata {
	id: string;
	caCertPem: string;
	createdAt: Date;
	expiresAt: Date;
	fingerprint: Fingerprint;
}

export interface SignInput {
	algorithm: string;
	body: string;
	privateKey: string;
}

export interface KeyPair {
	publicKey: string;
	privateKey: string;
}

export type KeyPairWithId = KeyPair & { id: string };

export interface CertificateInfo {
	serialNumber: SerialNumber;
	subject: string;
	issuer: string;
	notBefore: Date;
	notAfter: Date;
	fingerprint: Fingerprint;
	san: string[];
}
