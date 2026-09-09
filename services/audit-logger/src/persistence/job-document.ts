import type {
	InstanceId,
	JobId,
	JobType,
} from "@trading-model/common/domain/primitives";
import type { RetryPolicy } from "@trading-model/common/domain/retry-policy";
import type {
	JobEvent,
	JobPriority,
	JobStatus,
} from "@trading-model/validation/domain/contracts/recovery.types";

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
