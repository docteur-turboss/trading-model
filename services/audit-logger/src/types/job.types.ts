import type {
	JobType,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import {
	type Job,
	type JobEvent,
	JobPriority,
	JobStatus,
} from "@trading-model/validation/contracts/recovery.types";

export type { Job, JobEvent };
export { JobPriority, JobStatus };

/** Parameter object for submitting a new job to the scheduler. */
export interface SubmitJobParams {
	type: JobType;
	payload: unknown;
	priority?: JobPriority;
	maxRetries?: number;
}

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
