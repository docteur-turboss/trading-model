import type {
	InstanceId,
	JobId,
	JobType,
	PositiveInt,
} from "../domain/primitives";
import { UnixTimestamp } from "../domain/primitives";
import type { RetryPolicy } from "../domain/retry-policy";
import { AppError } from "../utils/errors";

/**
 * Job priority levels.
 * Higher numeric value = higher priority.
 */
export type JobPriority = number & { readonly brand: "JobPriority" };
export const JobPriority = {
	LOWEST: 1 as JobPriority,
	LOW: 2 as JobPriority,
	MEDIUM: 3 as JobPriority,
	HIGH: 4 as JobPriority,
	HIGHEST: 5 as JobPriority,

	isHigherPriority(left: JobPriority, right: JobPriority): boolean {
		return left > right;
	},

	isLowerPriority(left: JobPriority, right: JobPriority): boolean {
		return left < right;
	},

	isAtLeast(left: JobPriority, threshold: JobPriority): boolean {
		return left >= threshold;
	},
};

/**
 * @deprecated Use JobPriority.isHigherPriority() instead.
 */
export function isHigherPriority(
	left: JobPriority,
	right: JobPriority
): boolean {
	return JobPriority.isHigherPriority(left, right);
}

/**
 * @deprecated Use JobPriority.isLowerPriority() instead.
 */
export function isLowerPriority(
	left: JobPriority,
	right: JobPriority
): boolean {
	return JobPriority.isLowerPriority(left, right);
}

/**
 * @deprecated Use JobPriority.isAtLeast() instead.
 */
export function isAtLeast(left: JobPriority, threshold: JobPriority): boolean {
	return JobPriority.isAtLeast(left, threshold);
}

export enum JobStatus {
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

export namespace JobStatus {
	const TerminalSet = new Set<JobStatus>([
		JobStatus.COMPLETED,
		JobStatus.FAILED,
		JobStatus.CANCELLED,
	]);

	const NonTerminalSet = new Set<JobStatus>([
		JobStatus.PENDING,
		JobStatus.QUEUED,
		JobStatus.ASSIGNED,
		JobStatus.RUNNING,
		JobStatus.ORPHANED,
	]);

	const AllValues: JobStatus[] = Object.values(JobStatus).filter(
		(value): value is JobStatus => typeof value === "string"
	);

	const Transitions: Record<JobStatus, ReadonlySet<JobStatus>> = {
		[JobStatus.PENDING]: new Set([JobStatus.QUEUED]),
		[JobStatus.IN_PROGRESS]: new Set([JobStatus.COMPLETED, JobStatus.FAILED]),
		[JobStatus.QUEUED]: new Set([JobStatus.ASSIGNED]),
		[JobStatus.ASSIGNED]: new Set([JobStatus.RUNNING, JobStatus.ORPHANED]),
		[JobStatus.RUNNING]: new Set([
			JobStatus.COMPLETED,
			JobStatus.FAILED,
			JobStatus.ORPHANED,
		]),
		[JobStatus.ORPHANED]: new Set([JobStatus.QUEUED, JobStatus.FAILED]),
		[JobStatus.FAILED]: new Set([JobStatus.QUEUED]),
		[JobStatus.COMPLETED]: new Set(),
		[JobStatus.CANCELLED]: new Set(),
	};

	export function values(): JobStatus[] {
		return Array.from(AllValues);
	}

	export function nonTerminal(): JobStatus[] {
		return Array.from(NonTerminalSet);
	}

	export function terminal(): JobStatus[] {
		return Array.from(TerminalSet);
	}

	export function isTerminal(status: JobStatus): boolean {
		return TerminalSet.has(status);
	}

	export function canTransition(from: JobStatus, to: JobStatus): boolean {
		return Transitions[from]?.has(to) ?? false;
	}

	export function canCancel(status: JobStatus): boolean {
		return NonTerminalSet.has(status);
	}

	export function transition(
		from: JobStatus,
		to: JobStatus,
		reason?: string
	): JobEvent {
		if (to === JobStatus.CANCELLED && !JobStatus.canCancel(from)) {
			throw new AppError(reason ?? `Cannot cancel job from ${from}`, {
				code: "JobStatusError",
				cause: { from, to },
			});
		}
		if (to !== JobStatus.CANCELLED && !JobStatus.canTransition(from, to)) {
			throw new AppError(`Invalid job status transition: ${from} → ${to}`, {
				code: "JobStatusError",
				cause: { from, to },
			});
		}
		return {
			transition: { from, to },
			timestamp: UnixTimestamp.now(),
			reason: reason ?? "",
		};
	}
}

export interface StatusTransition {
	from: JobStatus;
	to: JobStatus;
}

/**
 * @deprecated Use JobStatus.terminal() instead.
 */
export const JOB_STATUS_TERMINAL: readonly JobStatus[] = JobStatus.terminal();

/**
 * @deprecated Use JobStatus.nonTerminal() instead.
 */
export const JOB_STATUS_NON_TERMINAL: readonly JobStatus[] =
	JobStatus.nonTerminal();

/**
 * @deprecated Use JobStatus.isTerminal() instead.
 */
export function isTerminalStatus(status: JobStatus): boolean {
	return JobStatus.isTerminal(status);
}

export interface JobEvent {
	transition: StatusTransition;
	timestamp: UnixTimestamp;
	reason: string;
}

export interface Job<TData = unknown> extends RetryPolicy {
	id: JobId;
	type: JobType;
	payload: TData;
	priority: JobPriority;
	status: JobStatus;
	assignedWorkerId?: InstanceId;
	ackDeadline: PositiveInt;
	createdAt: UnixTimestamp;
	startedAt?: UnixTimestamp;
	completedAt?: UnixTimestamp;
	result?: unknown;
	error?: string;
	history: JobEvent[];
}

export type JobUpdateExtras = Partial<
	Pick<Job, "result" | "error" | "assignedWorkerId" | "ackDeadline">
>;

/** @deprecated Use `JobStatus` instead. */
export { JobStatus as JOB_STATUS };
