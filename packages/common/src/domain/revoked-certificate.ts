import type { SerialNumber, ServiceId, UnixTimestamp } from "./primitives";
import type { RevocationReason } from "./revocation-request";

export interface RevokedCertificate {
	serialNumber: SerialNumber;
	serviceId: ServiceId;
	revokedAt: UnixTimestamp;
	reason: RevocationReason;
}
