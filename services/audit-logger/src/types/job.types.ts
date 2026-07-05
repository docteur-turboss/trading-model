import type { Job, JobEvent, JobStatus } from "@trading-model/common/contracts/recovery.types";
import { JOB_STATUS_NON_TERMINAL } from "@trading-model/common/contracts/recovery.types";

export type { Job, JobEvent, JobStatus };
export { JOB_STATUS_NON_TERMINAL };

export interface QueuedJob<TData = unknown> {
	job: Job<TData>;
	state: "queued" | "delivered" | "acknowledged";
	deliveryAttempts: number;
	expiresAt: number;
	assignedAt?: Date;
}
