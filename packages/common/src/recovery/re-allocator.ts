import { logger } from "../config/logger";
import type { Job } from "../contracts/recovery.types";
import type { IJobQueue } from "./job-queue.interface";
import type { IJobRepository } from "./job-repository.interface";

export class ReAllocator {
	constructor(
		private readonly _repository: IJobRepository,
		private readonly _queue: IJobQueue,
		private readonly _ackTimeoutMs: number
	) {}

	async reallocate(job: Job): Promise<void> {
		if (job.retryCount >= job.maxRetries) {
			await this._repository.updateStatus(job.id, "failed", {
				error: `Exceeded max retries (${job.maxRetries})`,
			});

			logger.warn("Job failed after max retries", {
				jobId: job.id,
				retryCount: job.retryCount,
			});
			return;
		}

		const newDeadline = Date.now() + this._ackTimeoutMs;
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

		logger.info("Job re-allocated to queue", {
			jobId: job.id,
			retryCount: updatedJob.retryCount,
		});
	}
}
