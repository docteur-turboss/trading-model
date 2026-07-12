import {
	toInstanceId,
	toKeyId,
	toKeyVersion,
	toSerialNumber,
	toServiceId,
} from "@trading-model/common/domain/primitives";
import { RevocationReason } from "@trading-model/common/domain/revocation-request";
import { CertificateEvent } from "@trading-model/validation/contracts/certificate-events";
import { z } from "zod";

export const CERTIFICATE_EVENT_VALIDATORS = {
	[CertificateEvent.CertificateRevoked]: z.object({
		serialNumber: z.string().transform(toSerialNumber),
		serviceId: z.string().transform(toServiceId),
		reason: z.nativeEnum(RevocationReason),
		revokedAt: z.string(),
		instanceId: z.string().transform(toInstanceId),
	}),
	[CertificateEvent.CaKeyRotated]: z.object({
		keyId: z.string().transform(toKeyId),
		keyVersion: z.number().transform(toKeyVersion),
		instanceId: z.string().transform(toInstanceId),
	}),
};
