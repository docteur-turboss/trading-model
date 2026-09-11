import type { Job } from "../../src/types/job.types";

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
