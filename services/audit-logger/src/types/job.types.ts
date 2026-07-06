import type { Job, JobEvent, JobPriority, JobStatus } from "@trading-model/common/contracts/recovery.types";
import { JOB_STATUS_NON_TERMINAL } from "@trading-model/common/contracts/recovery.types";

export type { Job, JobEvent, JobPriority, JobStatus };
export { JOB_STATUS_NON_TERMINAL };

export interface QueuedJob<TData = unknown> {
	job: Job<TData>;
	state: "queued" | "delivered" | "acknowledged";
	deliveryAttempts: number;
	expiresAt: number;
	assignedAt?: Date;
}
