import type { Fingerprint } from "../../domain/primitives";

export enum CertificateStatus {
	Valid = "valid",
	Expiring = "expiring",
	Revoked = "revoked",
}

export interface CertificateEntry {
	id: string;
	commonName: string;
	fingerprint: Fingerprint;
	expiresAt: string;
	status: CertificateStatus;
	issuer: string;
}
