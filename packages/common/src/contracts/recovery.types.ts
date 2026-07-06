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

export type JobStatus =
	| "pending"
	| "queued"
	| "assigned"
	| "running"
	| "completed"
	| "failed"
	| "cancelled"
	| "orphaned";

export interface JobEvent {
	fromStatus: JobStatus;
	toStatus: JobStatus;
	timestamp: Date;
	reason: string;
}

export interface Job<TData = unknown> {
	id: string;
	type: string;
	payload: TData;
	priority: JobPriority;
	status: JobStatus;
	assignedWorkerId?: string;
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

export const JOB_STATUS_NON_TERMINAL: readonly JobStatus[] = [
	"pending",
	"queued",
	"assigned",
	"running",
	"orphaned",
];

export const JOB_STATUS_TERMINAL: readonly JobStatus[] = [
	"completed",
	"failed",
	"cancelled",
];

const TERMINAL_SET = new Set(JOB_STATUS_TERMINAL);

export function isTerminalStatus(status: JobStatus): boolean {
	return TERMINAL_SET.has(status);
}
