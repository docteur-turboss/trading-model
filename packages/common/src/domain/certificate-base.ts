import type {
	CaPem,
	CertPem,
	Fingerprint,
	SerialNumber,
	UnixTimestamp,
} from "./primitives";

export interface CertificateBase {
	certPem: CertPem;
	caPem: CaPem;
	serialNumber: SerialNumber;
	expiresAt: UnixTimestamp;
}

export type CertPemPair = Pick<CertificateBase, "certPem" | "caPem">;

export interface CertificateResponse extends CertificateBase {
	fingerprint: Fingerprint;
	issuedAt?: UnixTimestamp;
}
