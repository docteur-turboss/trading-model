import type {
	InstanceId,
	JobId,
	JobType,
	JsonObject,
	PositiveInt,
	UnixTimestamp,
} from "../../domain/primitives";
import type { JOB_STATUS, JobPriority } from "../recovery.types";

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
	pending: PositiveInt;
	inProgress: PositiveInt;
	failed: PositiveInt;
}
