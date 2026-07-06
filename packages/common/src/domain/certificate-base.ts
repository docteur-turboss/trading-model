export interface CertificateBase {
	certPem: string;
	caPem: string;
	serialNumber: string;
	expiresAt: Date;
}
