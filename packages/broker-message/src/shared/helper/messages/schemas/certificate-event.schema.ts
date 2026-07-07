import { CertificateEvent } from "@trading-model/common/contracts/certificate-events";
import { z } from "zod";

export const CERTIFICATE_EVENT_VALIDATORS = {
	[CertificateEvent.certificateRevoked]: z.object({
		serialNumber: z.string(),
		serviceId: z.string(),
		reason: z.string(),
		revokedAt: z.string(),
		instanceId: z.string(),
	}),
	[CertificateEvent.caKeyRotated]: z.object({
		keyId: z.string(),
		keyVersion: z.number(),
		instanceId: z.string(),
	}),
};
