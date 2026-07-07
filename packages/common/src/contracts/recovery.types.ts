import type { InstanceId, JobId, JobType } from "../domain/primitives";

/**
 * Job priority levels.
 * Higher numeric value = higher priority.
 */
export enum JobPriority {
	LOWEST = 1,
	LOW = 2,
	MEDIUM = 3,
	HIGH = 4,
	HIGHEST = 5,
}

export enum JOB_STATUS {
	PENDING = "pending",
	QUEUED = "queued",
	ASSIGNED = "assigned",
	RUNNING = "running",
	COMPLETED = "completed",
	FAILED = "failed",
	CANCELLED = "cancelled",
	ORPHANED = "orphaned",
}

export interface JobEvent {
	fromStatus: JOB_STATUS;
	toStatus: JOB_STATUS;
	timestamp: Date;
	reason: string;
}

export interface Job<TData = unknown> {
	id: JobId;
	type: JobType;
	payload: TData;
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

export type JobUpdateExtras = Partial<
	Pick<Job, "result" | "error" | "assignedWorkerId" | "ackDeadline">
>;

export const JOB_STATUS_NON_TERMINAL: readonly JOB_STATUS[] = [
	JOB_STATUS.PENDING,
	JOB_STATUS.QUEUED,
	JOB_STATUS.ASSIGNED,
	JOB_STATUS.RUNNING,
	JOB_STATUS.ORPHANED,
];

export const JOB_STATUS_TERMINAL: readonly JOB_STATUS[] = [
	JOB_STATUS.COMPLETED,
	JOB_STATUS.FAILED,
	JOB_STATUS.CANCELLED,
];

const TERMINAL_SET = new Set(JOB_STATUS_TERMINAL);

export function isTerminalStatus(status: JOB_STATUS): boolean {
	return TERMINAL_SET.has(status);
}
