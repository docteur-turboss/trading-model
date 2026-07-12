import type {
	CertificateId,
	CommonName,
	Fingerprint,
	ISODateTime,
	ServiceId,
} from "../../domain/primitives";

export enum CertificateStatus {
	Valid = "valid",
	Expiring = "expiring",
	Revoked = "revoked",
}

export interface CertificateEntry {
	id: CertificateId;
	commonName: CommonName;
	fingerprint: Fingerprint;
	expiresAt: ISODateTime;
	status: CertificateStatus;
	issuer: ServiceId;
}
