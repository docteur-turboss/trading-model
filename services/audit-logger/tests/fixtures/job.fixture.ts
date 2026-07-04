import type { Job, JobEvent, QueuedJob } from "../../src/types/job.types";

export const createJobEvent = (overrides?: Partial<JobEvent>): JobEvent => ({
	fromStatus: "pending",
	toStatus: "queued",
	timestamp: new Date(),
	reason: "created",
	...overrides,
});

export const createJob = (overrides?: Partial<Job>): Job => ({
	id: "test-job-1",
	type: "test-job-type",
	payload: { key: "value" },
	priority: 3,
	status: "pending",
	ackDeadline: 0,
	maxRetries: 3,
	retryCount: 0,
	createdAt: new Date(),
	history: [],
	...overrides,
});

export const createQueuedJob = (overrides?: Partial<QueuedJob>): QueuedJob => ({
	job: createJob(),
	state: "queued",
	deliveryAttempts: 0,
	expiresAt: 0,
	...overrides,
});
