import {
	JOB_STATUS,
	JOB_STATUS_NON_TERMINAL,
	type Job,
	type JobEvent,
	JobPriority,
	type JobStatus,
} from "@trading-model/common/contracts/recovery.types";

export type { Job, JobEvent, JobStatus };
export { JOB_STATUS, JOB_STATUS_NON_TERMINAL, JobPriority };

export interface QueuedJob<TData = unknown> {
	job: Job<TData>;
	state: "queued" | "delivered" | "acknowledged";
	deliveryAttempts: number;
	expiresAt: number;
	assignedAt?: Date;
}
