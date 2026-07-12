import type {
	InstanceId,
	KeyId,
	KeyVersion,
	SerialNumber,
	ServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { RevocationReason } from "@trading-model/common/domain/revocation-request";

/** Named references for certificate / CA event message keys. */
export enum CertificateEvent {
	CertificateRevoked = "ca.certificate.revoked",
	CaKeyRotated = "ca.key.rotated",
}

/** Maps certificate event names to their associated payload types. */
export interface CertificateEventMap {
	[CertificateEvent.CertificateRevoked]: {
		serialNumber: SerialNumber;
		serviceId: ServiceId;
		reason: RevocationReason;
		revokedAt: UnixTimestamp;
		instanceId: InstanceId;
	};
	[CertificateEvent.CaKeyRotated]: {
		keyId: KeyId;
		keyVersion: KeyVersion;
		instanceId: InstanceId;
	};
}
