import type { CertificateBase } from "@trading-model/common/domain/certificate-base";
import type {
	CaPem,
	CommonName,
	Fingerprint,
	KeyId,
	KeyPem,
	SerialNumber,
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { RevokedCertificate } from "@trading-model/common/domain/revoked-certificate";

export interface SignedCertificate extends CertificateBase {
	serviceId: ServiceId;
	issuedAt: UnixTimestamp;
	fingerprint: Fingerprint;
}

export type { RevokedCertificate };

export interface CaMetadata {
	id: SerialNumber;
	caCertPem: CaPem;
	createdAt: Date;
	expiresAt: Date;
	fingerprint: Fingerprint;
}

export interface SignInput {
	algorithm: string;
	body: string;
	privateKey: KeyPem;
}

export interface KeyPair {
	publicKey: KeyPem;
	privateKey: KeyPem;
}

export interface CaCredentials {
	caKeyPair: KeyPair;
	caCertPem: CaPem;
}

export type KeyPairWithId = KeyPair & { id: KeyId };

export interface CertificateInfo {
	serialNumber: SerialNumber;
	subject: CommonName;
	issuer: CommonName;
	notBefore: Date;
	notAfter: Date;
	fingerprint: Fingerprint;
	san: CommonName[];
}
