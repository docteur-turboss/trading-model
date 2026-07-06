export interface CertificateBase {
	certPem: string;
	caPem: string;
	serialNumber: string;
	expiresAt: Date;
}

export interface CertificateResponse extends CertificateBase {
	fingerprint: string;
	issuedAt?: Date;
}
