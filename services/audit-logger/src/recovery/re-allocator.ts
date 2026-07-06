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
		if (job.retryCount >= job.maxRetries) {
			await this._repository.updateStatus(job.id, "failed", {
				error: `Exceeded max retries (${job.maxRetries})`,
			});

			logger.warn("Job failed after max retries", { context: {
				jobId: job.id,
				retryCount: job.retryCount,
			} });
			return;
		}

		const newDeadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const updatedJob: Job = {
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

		this._queue.enqueue(updatedJob);
		await this._repository.updateStatus(job.id, "queued", {
			ackDeadline: newDeadline,
		});

		logger.info("Job re-allocated to queue", { context: {
			jobId: job.id,
			retryCount: updatedJob.retryCount,
		} });
	}
}
