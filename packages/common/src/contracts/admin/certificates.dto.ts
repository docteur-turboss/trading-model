import type { Fingerprint } from "../../domain/primitives";

export interface CertificateEntry {
	id: string;
	commonName: string;
	fingerprint: Fingerprint;
	expiresAt: string;
	status: "valid" | "expiring" | "revoked";
	issuer: string;
}
