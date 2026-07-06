import type { JobId } from "../../domain/primitives";

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
	type: string;
	priority: AdminJobPriority;
	status: AdminJobStatus;
	worker: string | null;
}

export interface JobDetail {
	id: JobId;
	type: string;
	priority: AdminJobPriority;
	status: AdminJobStatus;
	worker: string | null;
	timeline: JobTimelineEntry[];
	payload: Record<string, unknown>;
	logs: string[];
}

export interface JobTimelineEntry {
	event: string;
	timestamp: string;
	description: string;
	active?: boolean;
}

export interface JobStats {
	pending: number;
	inProgress: number;
	failed: number;
}
