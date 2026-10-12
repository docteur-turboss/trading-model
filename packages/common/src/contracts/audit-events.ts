import type { InstanceId, UnixTimestamp } from "../domain/primitives";
import type { ServiceInstanceName } from "../domain/service-instance-name";

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
