import {
	type Job,
	JobPriority,
	JobStatus,
} from "@trading-model/contracts/recovery-types";
import type {
	JobType,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

export type { Job };
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
}

export interface QueuedJob<TData = unknown> {
	job: Job<TData>;
	state: JobState;
	deliveryAttempts: PositiveInt;
	expiresAt: UnixTimestamp;
	assignedAt?: Date;
}
