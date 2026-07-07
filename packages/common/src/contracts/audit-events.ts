import type { InstanceId } from "../domain/primitives";
import type { ServiceInstanceName } from "../config/services.types";

/** Named references for audit event message keys. */
export enum AuditEvent {
	auditHeartbeat = "audit.heartbeat",
	auditGapDetected = "audit.gap.detected",
}

/** Maps audit event names to their associated payload types. */
export interface AuditEventMap {
	[AuditEvent.auditHeartbeat]: {
		serviceName: ServiceInstanceName;
		instanceId: InstanceId;
	};
	[AuditEvent.auditGapDetected]: {
		from: Date;
		to: Date;
		lostCount?: number;
	};
}
