import type { InstanceId } from "@trading-model/common/domain/primitives";

export interface CallMetrics {
	instanceId: InstanceId;
	durationMs?: number;
}

export interface ServiceCallResult extends CallMetrics {
	success: boolean;
}
