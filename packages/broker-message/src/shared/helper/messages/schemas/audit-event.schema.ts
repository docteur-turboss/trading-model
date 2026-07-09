import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { AuditEvent } from "@trading-model/common/contracts/audit-events";
import { z } from "zod";

export const AUDIT_EVENT_VALIDATORS = {
	[AuditEvent.auditHeartbeat]: z.object({
		serviceName: z.nativeEnum(ServiceInstanceName),
		instanceId: z.string(),
	}),
	[AuditEvent.auditGapDetected]: z.object({
		from: z.string().transform((str) => new Date(str)),
		to: z.string().transform((str) => new Date(str)),
		lostCount: z.number().int().optional(),
	}),
};
