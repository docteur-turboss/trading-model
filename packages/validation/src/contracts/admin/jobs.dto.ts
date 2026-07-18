import type {
	InstanceId,
	JobId,
	JobType,
	JsonObject,
	PositiveInt,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type {
	JobPriority,
	JobStatus,
} from "@trading-model/validation/contracts/recovery.types";

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

export interface JobSummary {
	id: JobId;
	type: JobType;
	priority: JobPriority;
	status: JobStatus;
	worker: InstanceId | null;
}

export interface JobEntry extends JobSummary {}

export interface JobDetail extends JobSummary {
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
