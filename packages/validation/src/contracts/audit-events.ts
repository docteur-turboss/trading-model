import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	InstanceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";

/** Named references for audit event message keys. */
export enum AuditEvent {
	AuditHeartbeat = "audit.heartbeat",
	AuditGapDetected = "audit.gap.detected",
}

/** Maps audit event names to their associated payload types. */
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
