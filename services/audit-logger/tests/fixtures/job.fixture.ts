import type { Job, JobEvent, QueuedJob } from "../../src/types/job.types";
import { JobState } from "../../src/types/job.types";

export const createJobEvent = (overrides?: Partial<JobEvent>): JobEvent =>
	({
		transition: { from: "pending" as any, to: "queued" as any },
		timestamp: new Date() as any,
		reason: "created",
		...overrides,
	}) as any;

export const createJob = (overrides?: Partial<Job>): Job =>
	({
		id: "test-job-1" as any,
		type: "test-job-type" as any,
		payload: { key: "value" },
		priority: 3 as any,
		status: "pending" as any,
		ackDeadline: 0 as any,
		maxRetries: 3 as any,
		retryCount: 0 as any,
		createdAt: new Date() as any,
		history: [],
		...overrides,
	}) as any;

export const createQueuedJob = (overrides?: Partial<QueuedJob>): QueuedJob =>
	({
		job: createJob(),
		state: JobState.Queued,
		deliveryAttempts: 0 as any,
		expiresAt: 0 as any,
		...overrides,
	}) as any;
