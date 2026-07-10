import type {
	InstanceId,
	JobId,
	JobType,
	UnixTimestamp,
	JsonObject,
} from "../../domain/primitives";
import type { JobPriority, JOB_STATUS } from "../recovery.types";

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

export interface JobEntry {
	id: JobId;
	type: JobType;
	priority: JobPriority;
	status: JOB_STATUS;
	worker: InstanceId | null;
}

export interface JobDetail {
	id: JobId;
	type: JobType;
	priority: JobPriority;
	status: JOB_STATUS;
	worker: InstanceId | null;
	timeline: JobTimelineEntry[];
	payload: JsonObject;
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
