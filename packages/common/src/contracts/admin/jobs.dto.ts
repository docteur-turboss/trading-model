import type {
	InstanceId,
	JobId,
	JobType,
	UnixTimestamp,
} from "../../domain/primitives";

export enum JobTimelineEvent {
	Created = "created",
	Queued = "queued",
	Assigned = "assigned",
	Started = "started",
	Completed = "completed",
	Failed = "failed",
	Cancelled = "cancelled",
	Orphaned = "orphaned",
	Retrying = "retrying",
}

export enum AdminJobPriority {
	High = "HIGH",
	Medium = "MEDIUM",
	Low = "LOW",
	Critical = "CRITICAL",
}

export enum AdminJobStatus {
	Pending = "pending",
	InProgress = "in_progress",
	Completed = "completed",
	Failed = "failed",
	Cancelled = "cancelled",
}

export interface JobEntry {
	id: JobId;
	type: JobType;
	priority: AdminJobPriority;
	status: AdminJobStatus;
	worker: InstanceId | null;
}

export interface JobDetail {
	id: JobId;
	type: JobType;
	priority: AdminJobPriority;
	status: AdminJobStatus;
	worker: InstanceId | null;
	timeline: JobTimelineEntry[];
	payload: Record<string, unknown>;
	logs: string[];
}

export interface JobTimelineEntry {
	event: JobTimelineEvent;
	timestamp: UnixTimestamp;
	description: string;
	active?: boolean;
}

export interface JobStats {
	pending: number;
	inProgress: number;
	failed: number;
}
