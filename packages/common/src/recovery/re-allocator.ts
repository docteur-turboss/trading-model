import { logger } from "../config/logger";
import {
	JOB_STATUS,
	type Job,
	type JobEvent,
} from "../contracts/recovery.types";
import { hasExceededMaxRetries } from "../domain/retry-policy";
import type { IJobQueue } from "./job-queue.interface";
import type { IJobRepository } from "./job-repository.interface";

export class ReAllocator {
	constructor(
		private readonly _repository: IJobRepository,
		private readonly _queue: IJobQueue,
		private readonly _ackTimeoutMs: number
	) {}

	private async _failMaxRetries(job: Job): Promise<void> {
		await this._repository.updateStatus(job.id, JOB_STATUS.FAILED, {
			error: `Exceeded max retries (${job.maxRetries})`,
		});
		logger.warn("Job failed after max retries", {
			context: { jobId: job.id, retryCount: job.retryCount },
		});
	}

	private _buildHistoryEntry(): JobEvent {
		return {
			fromStatus: JOB_STATUS.ORPHANED,
			toStatus: JOB_STATUS.QUEUED,
			timestamp: new Date(),
			reason: "re-allocated",
		};
	}

	private _buildReallocatedJob(job: Job, newDeadline: number): Job {
		return {
			...job,
			status: JOB_STATUS.QUEUED,
			ackDeadline: newDeadline,
			retryCount: job.retryCount + 1,
			assignedWorkerId: undefined,
			history: [...job.history, this._buildHistoryEntry()],
		};
	}

	async reallocate(job: Job): Promise<void> {
		if (hasExceededMaxRetries(job)) {
			return this._failMaxRetries(job);
		}
		const newDeadline = Date.now() + this._ackTimeoutMs;
		const updatedJob = this._buildReallocatedJob(job, newDeadline);
		this._queue.enqueue(updatedJob);
		await this._repository.updateStatus(job.id, JOB_STATUS.QUEUED, {
			ackDeadline: newDeadline,
		});
		logger.info("Job re-allocated to queue", {
			context: { jobId: job.id, retryCount: updatedJob.retryCount },
		});
	}
}
