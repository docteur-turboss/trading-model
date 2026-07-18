import {
	JobStatus as JOB_STATUS,
	type Job,
	type JobEvent,
} from "@trading-model/validation/contracts/recovery.types";
import { logger } from "../config/logger";
import { PositiveInt, UnixTimestamp } from "../domain/primitives";
import { RetryPolicy } from "../domain/retry-policy";
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
			transition: { from: JOB_STATUS.ORPHANED, to: JOB_STATUS.QUEUED },
			timestamp: UnixTimestamp.now(),
			reason: "re-allocated",
		};
	}

	private _buildReallocatedJob(job: Job, newDeadline: PositiveInt): Job {
		return {
			...job,
			status: JOB_STATUS.QUEUED,
			ackDeadline: newDeadline,
			retryCount: PositiveInt.of(job.retryCount + 1),
			assignedWorkerId: undefined,
			history: [...job.history, this._buildHistoryEntry()],
		};
	}

	async reallocate(job: Job): Promise<void> {
		if (RetryPolicy.hasExceededMaxRetries(job)) {
			return this._failMaxRetries(job);
		}
		const newDeadline = PositiveInt.of(Date.now() + this._ackTimeoutMs);
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
