import type { InstanceId, JobId } from "../domain/primitives";

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

export const JOB_STATUS = {
	PENDING: "pending",
	QUEUED: "queued",
	ASSIGNED: "assigned",
	RUNNING: "running",
	COMPLETED: "completed",
	FAILED: "failed",
	CANCELLED: "cancelled",
	ORPHANED: "orphaned",
} as const satisfies Record<string, string>;

export type JobStatus = (typeof JOB_STATUS)[keyof typeof JOB_STATUS];

export interface JobEvent {
	fromStatus: JobStatus;
	toStatus: JobStatus;
	timestamp: Date;
	reason: string;
}

export interface Job<TData = unknown> {
	id: JobId;
	type: string;
	payload: TData;
	priority: JobPriority;
	status: JobStatus;
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

export const JOB_STATUS_NON_TERMINAL: readonly JobStatus[] = [
	JOB_STATUS.PENDING,
	JOB_STATUS.QUEUED,
	JOB_STATUS.ASSIGNED,
	JOB_STATUS.RUNNING,
	JOB_STATUS.ORPHANED,
];

export const JOB_STATUS_TERMINAL: readonly JobStatus[] = [
	JOB_STATUS.COMPLETED,
	JOB_STATUS.FAILED,
	JOB_STATUS.CANCELLED,
];

const TERMINAL_SET = new Set(JOB_STATUS_TERMINAL);

export function isTerminalStatus(status: JobStatus): boolean {
	return TERMINAL_SET.has(status);
}
