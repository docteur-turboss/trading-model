import { logger } from "@trading-model/common/config/logger";
import type { JobRepository } from "../persistence/job-repository";
import { JOB_STATUS } from "../types/job.types";
import type { InternalQueue } from "./internal-queue";
import type { JobAssignmentManager } from "./job-assignment-manager";
import type { JobFailureHandler } from "./job-failure-handler";

export class JobStatusManager {
	constructor(
		private readonly _queue: InternalQueue,
		private readonly _repository: JobRepository,
		private readonly _assignmentManager: JobAssignmentManager,
		private readonly _failureHandler: JobFailureHandler
	) {}

	async ack(jobId: string): Promise<void> {
		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, "running");

		logger.info("Job acknowledged by worker", { context: { jobId } });
	}

	async complete(jobId: string, result: unknown): Promise<void> {
		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, "completed", { result });

		const job = await this._repository.findById(jobId);
		this._assignmentManager.decrementWorkerLoad(job?.assignedWorkerId);

		logger.info("Job completed", { context: { jobId } });
		this._assignmentManager.distributeNext();
	}

	async fail(jobId: string, error: string): Promise<void> {
		this._queue.ack(jobId);

		const job = await this._repository.findById(jobId);
		if (!job) {
			return;
		}

		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

		if (job.retryCount >= job.maxRetries) {
			await this._failureHandler.handlePermanentFailure(jobId, error);
		} else {
			await this._failureHandler.handleRetryableFailure(jobId, job, error);
		}
	}

	async cancel(jobId: string): Promise<void> {
		const job = await this._repository.findById(jobId);
		if (!job) {
			return;
		}

		if (
			job.status === JOB_STATUS.RUNNING ||
			job.status === JOB_STATUS.COMPLETED
		) {
			throw new Error("Cannot cancel a running or completed job");
		}

		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, JOB_STATUS.CANCELLED);
		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

		logger.info("Job cancelled", { context: { jobId } });
	}
}
