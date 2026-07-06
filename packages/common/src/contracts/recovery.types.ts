/**
 * Job priority levels.
 * Higher numeric value = higher priority.
 */
export type JobPriority = 1 | 2 | 3 | 4 | 5;

export const JobPriority = {
	LOWEST: 1 as JobPriority,
	LOW: 2 as JobPriority,
	MEDIUM: 3 as JobPriority,
	HIGH: 4 as JobPriority,
	HIGHEST: 5 as JobPriority,
};

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
