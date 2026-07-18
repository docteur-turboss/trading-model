import type { ServiceInstanceName } from "../config/services.types";
import type { InstanceId, UnixTimestamp } from "../domain/primitives";

export enum AuditEvent {
	AuditHeartbeat = "audit.heartbeat",
	AuditGapDetected = "audit.gap.detected",
}

export interface AuditEventMap {
	[AuditEvent.AuditHeartbeat]: {
		serviceName: ServiceInstanceName;
		instanceId: InstanceId;
	};
	[AuditEvent.AuditGapDetected]: {
		from: UnixTimestamp;
		to: UnixTimestamp;
		lostCount?: number;
	};
}
