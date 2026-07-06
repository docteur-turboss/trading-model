import { logger } from "@trading-model/common/config/logger";

import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { InternalQueue } from "../scheduler/internal-queue";
import type { Job } from "../types/job.types";

export class ReAllocator {
	constructor(
		private readonly _repository: JobRepository,
		private readonly _queue: InternalQueue
	) {}

	async reallocate(job: Job): Promise<void> {
		if (_isRetryExhausted(job)) {
			await _failJob(this._repository, job);
			return;
		}

		const newDeadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const updatedJob = _buildReallocatedJob(job, newDeadline);

		this._queue.enqueue(updatedJob);
		await this._repository.updateStatus(job.id, "queued", {
			ackDeadline: newDeadline,
		});

		_logReallocation(job.id, updatedJob.retryCount);
	}
}

function _isRetryExhausted(job: Job): boolean {
	return job.retryCount >= job.maxRetries;
}

async function _failJob(
	repository: JobRepository,
	job: Job
): Promise<void> {
	await repository.updateStatus(job.id, "failed", {
		error: `Exceeded max retries (${job.maxRetries})`,
	});
	logger.warn("Job failed after max retries", { context: {
		jobId: job.id,
		retryCount: job.retryCount,
	} });
}

function _buildReallocatedJob(job: Job, newDeadline: number): Job {
	return {
		...job,
		status: "queued",
		ackDeadline: newDeadline,
		retryCount: job.retryCount + 1,
		assignedWorkerId: undefined,
		history: [
			...job.history,
			{
				fromStatus: "orphaned",
				toStatus: "queued",
				timestamp: new Date(),
				reason: "re-allocated",
			},
		],
	};
}

function _logReallocation(jobId: string, retryCount: number): void {
	logger.info("Job re-allocated to queue", { context: {
		jobId,
		retryCount,
	} });
}

export class ReAllocator {
}
