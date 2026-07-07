import type {
	InstanceId,
	KeyId,
	KeyVersion,
	SerialNumber,
	ServiceId,
	UnixTimestamp,
} from "../domain/primitives";
import type { RevocationReason } from "../domain/revocation-request";

/** Named references for certificate / CA event message keys. */
export enum CertificateEvent {
	certificateRevoked = "ca.certificate.revoked",
	caKeyRotated = "ca.key.rotated",
}

/** Maps certificate event names to their associated payload types. */
export interface CertificateEventMap {
	[CertificateEvent.certificateRevoked]: {
		serialNumber: SerialNumber;
		serviceId: ServiceId;
		reason: RevocationReason;
		revokedAt: UnixTimestamp;
		instanceId: InstanceId;
	};
	[CertificateEvent.caKeyRotated]: {
		keyId: KeyId;
		keyVersion: KeyVersion;
		instanceId: InstanceId;
	};
}
