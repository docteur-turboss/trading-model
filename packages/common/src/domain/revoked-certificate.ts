import type { SerialNumber, ServiceId } from "./primitives";

export interface RevokedCertificate {
	serialNumber: SerialNumber;
	serviceId: ServiceId;
	revokedAt: Date;
	reason: string;
}
