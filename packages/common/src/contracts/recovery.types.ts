import type { InstanceId, JobId, JobType } from "../domain/primitives";
import type { RetryPolicy } from "../domain/retry-policy";
import { AppError } from "../utils/errors";

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

export function isHigherPriority(a: JobPriority, b: JobPriority): boolean {
	return a > b;
}

export function isLowerPriority(a: JobPriority, b: JobPriority): boolean {
	return a < b;
}

export function isAtLeast(a: JobPriority, threshold: JobPriority): boolean {
	return a >= threshold;
}

export enum JOB_STATUS {
	PENDING = "pending",
	IN_PROGRESS = "in_progress",
	QUEUED = "queued",
	ASSIGNED = "assigned",
	RUNNING = "running",
	COMPLETED = "completed",
	FAILED = "failed",
	CANCELLED = "cancelled",
	ORPHANED = "orphaned",
}

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

const TRANSITIONS: Record<JOB_STATUS, ReadonlySet<JOB_STATUS>> = {
	[JOB_STATUS.PENDING]: new Set([JOB_STATUS.QUEUED]),
	[JOB_STATUS.IN_PROGRESS]: new Set([JOB_STATUS.COMPLETED, JOB_STATUS.FAILED]),
	[JOB_STATUS.QUEUED]: new Set([JOB_STATUS.ASSIGNED]),
	[JOB_STATUS.ASSIGNED]: new Set([JOB_STATUS.RUNNING, JOB_STATUS.ORPHANED]),
	[JOB_STATUS.RUNNING]: new Set([
		JOB_STATUS.COMPLETED,
		JOB_STATUS.FAILED,
		JOB_STATUS.ORPHANED,
	]),
	[JOB_STATUS.ORPHANED]: new Set([JOB_STATUS.QUEUED, JOB_STATUS.FAILED]),
	[JOB_STATUS.FAILED]: new Set([JOB_STATUS.QUEUED]),
	[JOB_STATUS.COMPLETED]: new Set(),
	[JOB_STATUS.CANCELLED]: new Set(),
};

const CANCELLABLE_FROM = new Set<JOB_STATUS>([
	JOB_STATUS.PENDING,
	JOB_STATUS.QUEUED,
	JOB_STATUS.ASSIGNED,
	JOB_STATUS.RUNNING,
	JOB_STATUS.ORPHANED,
]);

export interface StatusTransition {
	from: JOB_STATUS;
	to: JOB_STATUS;
}

export const JobStatusMachine = {
	canTransition(from: JOB_STATUS, to: JOB_STATUS): boolean {
		return TRANSITIONS[from]?.has(to) ?? false;
	},

	canCancel(status: JOB_STATUS): boolean {
		return CANCELLABLE_FROM.has(status);
	},

	transition(from: JOB_STATUS, to: JOB_STATUS, reason?: string): JobEvent {
		if (to === JOB_STATUS.CANCELLED && !JobStatusMachine.canCancel(from)) {
			throw new AppError(reason ?? `Cannot cancel job from ${from}`, {
				code: "JobStatusError",
				cause: { from, to },
			});
		}
		if (
			to !== JOB_STATUS.CANCELLED &&
			!JobStatusMachine.canTransition(from, to)
		) {
			throw new AppError(`Invalid job status transition: ${from} → ${to}`, {
				code: "JobStatusError",
				cause: { from, to },
			});
		}
		return {
			transition: { from, to },
			timestamp: new Date(),
			reason: reason ?? "",
		};
	},

	isTerminal(status: JOB_STATUS): boolean {
		return isTerminalStatus(status);
	},
};

export interface JobEvent {
	transition: StatusTransition;
	timestamp: Date;
	reason: string;
}

export interface Job<TData = unknown> extends RetryPolicy {
	id: JobId;
	type: JobType;
	payload: TData;
	priority: JobPriority;
	status: JOB_STATUS;
	assignedWorkerId?: InstanceId;
	ackDeadline: number;
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
