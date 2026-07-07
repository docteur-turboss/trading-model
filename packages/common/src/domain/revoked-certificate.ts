import type { SerialNumber, ServiceId } from "./primitives";
import type { RevocationReason } from "./revocation-request";

export interface RevokedCertificate {
	serialNumber: SerialNumber;
	serviceId: ServiceId;
	revokedAt: Date;
	reason: RevocationReason;
}
