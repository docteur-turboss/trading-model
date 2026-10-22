import type {
	InstanceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";
import type { ServiceInstanceName } from "@trading-model/primitives/service-instance-name";

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
