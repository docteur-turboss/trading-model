import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { AuditEvent } from "@trading-model/validation/contracts/audit-events";
import { z } from "zod";

export const AUDIT_EVENT_VALIDATORS = {
	[AuditEvent.AuditHeartbeat]: z.object({
		serviceName: z.nativeEnum(ServiceInstanceName),
		instanceId: z.string(),
	}),
	[AuditEvent.AuditGapDetected]: z.object({
		from: z.string().transform((str) => new Date(str)),
		to: z.string().transform((str) => new Date(str)),
		lostCount: z.number().int().optional(),
	}),
};
