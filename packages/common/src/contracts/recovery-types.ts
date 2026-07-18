import type {
	InstanceId,
	JobId,
	JobType,
	PositiveInt,
	UnixTimestamp,
} from "../domain/primitives";
import type { RetryPolicy } from "../domain/retry-policy";
import { createEnumValues } from "./enum-utils";

export type JobPriority = number & { readonly brand: "JobPriority" };
export const JobPriority = {
	LOWEST: 1 as JobPriority,
	LOW: 2 as JobPriority,
	MEDIUM: 3 as JobPriority,
	HIGH: 4 as JobPriority,
	HIGHEST: 5 as JobPriority,
};

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

	export const values: () => JobStatus[] = createEnumValues(JobStatus);

	export function isTerminal(status: JobStatus): boolean {
		return TerminalSet.has(status);
	}
}

export interface StatusTransition {
	from: JobStatus;
	to: JobStatus;
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
