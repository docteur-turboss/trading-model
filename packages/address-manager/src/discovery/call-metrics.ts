export interface CallMetrics {
	instanceId: string;
	durationMs?: number;
}

export interface ServiceCallResult extends CallMetrics {
	success: boolean;
}
