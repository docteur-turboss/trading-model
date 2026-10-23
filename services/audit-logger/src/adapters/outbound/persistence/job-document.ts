import type {
	JobEvent,
	JobPriority,
	JobStatus,
} from "@trading-model/contracts/recovery-types";
import type {
	InstanceId,
	JobId,
	JobType,
} from "@trading-model/primitives/primitives";
import type { RetryPolicy } from "@trading-model/primitives/retry-policy";

export interface JobDocument extends RetryPolicy {
	jobId: JobId;
	type: JobType;
	payload: unknown;
	priority: JobPriority;
	status: JobStatus;
	assignedWorkerId?: InstanceId;
	ackDeadline: number;
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	result?: unknown;
	error?: string;
	history: JobEvent[];
}
