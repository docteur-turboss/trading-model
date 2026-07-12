import type {
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import {
	JOB_STATUS_NON_TERMINAL,
	type Job,
	type JobEvent,
	JobPriority,
	JOB_STATUS as JobStatus,
} from "@trading-model/validation/contracts/recovery.types";

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
	deliveryAttempts: PositiveInt;
	expiresAt: UnixTimestamp;
	assignedAt?: Date;
}
