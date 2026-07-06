import type { Fingerprint, SerialNumber } from "./primitives";

export interface CertificateBase {
	certPem: string;
	caPem: string;
	serialNumber: SerialNumber;
	expiresAt: Date;
}

export interface CertificateResponse extends CertificateBase {
	fingerprint: Fingerprint;
	issuedAt?: Date;
}
