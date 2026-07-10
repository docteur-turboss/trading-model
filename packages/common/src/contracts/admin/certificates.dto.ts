import type { Fingerprint, ISODateTime, ServiceId } from "../../domain/primitives";

export enum CertificateStatus {
	Valid = "valid",
	Expiring = "expiring",
	Revoked = "revoked",
}

export interface CertificateEntry {
	id: string;
	commonName: string;
	fingerprint: Fingerprint;
	expiresAt: ISODateTime;
	status: CertificateStatus;
	issuer: ServiceId;
}
