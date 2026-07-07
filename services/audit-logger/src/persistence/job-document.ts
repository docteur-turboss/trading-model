import type {
	JOB_STATUS,
	JobEvent,
	JobPriority,
} from "@trading-model/common/contracts/recovery.types";
import type {
	InstanceId,
	JobId,
	JobType,
} from "@trading-model/common/domain/primitives";

export interface JobDocument {
	jobId: JobId;
	type: JobType;
	payload: unknown;
	priority: JobPriority;
	status: JOB_STATUS;
	assignedWorkerId?: InstanceId;
	ackDeadline: number;
	maxRetries: number;
	retryCount: number;
	createdAt: Date;
	startedAt?: Date;
	completedAt?: Date;
	result?: unknown;
	error?: string;
	history: JobEvent[];
}
