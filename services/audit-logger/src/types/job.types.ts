import {
	JOB_STATUS_NON_TERMINAL,
	type Job,
	type JobEvent,
	JobPriority,
	JobStatus,
} from "@trading-model/common/contracts/recovery.types";

export type { Job, JobEvent };
export { JOB_STATUS_NON_TERMINAL, JobPriority, JobStatus };

export enum JobState {
	Queued = "queued",
	Delivered = "delivered",
	Acknowledged = "acknowledged",
}

export interface QueuedJob<TData = unknown> {
	job: Job<TData>;
	state: JobState;
	deliveryAttempts: number;
	expiresAt: number;
	assignedAt?: Date;
}
