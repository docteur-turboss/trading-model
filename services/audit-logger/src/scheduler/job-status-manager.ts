import { logger } from "@trading-model/common/config/logger";
import type { JobId } from "@trading-model/common/domain/primitives";
import { hasExceededMaxRetries } from "@trading-model/common/domain/retry-policy";
import type { Job } from "@trading-model/validation/contracts/recovery.types";
import type { JobRepository } from "../persistence/job-repository";
import { JobStatus } from "../types/job.types";
import type { InternalQueue } from "./internal-queue";
import type { JobAssignmentManager } from "./job-assignment-manager";
import type { JobFailureHandler } from "./job-failure-handler";
import type { JobLifecycleDeps } from "./job-lifecycle";

export class JobStatusManager {
	constructor(private readonly _deps: JobLifecycleDeps) {}

	private get _queue(): InternalQueue {
		return this._deps.queue;
	}
	private get _repository(): JobRepository {
		return this._deps.repository;
	}
	private get _assignmentManager(): JobAssignmentManager {
		return this._deps.assignmentManager;
	}
	private get _failureHandler(): JobFailureHandler {
		return this._deps.failureHandler;
	}

	async ack(jobId: JobId): Promise<void> {
		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, JobStatus.RUNNING);
		logger.info("Job acknowledged by worker", { context: { jobId } });
	}

	async complete(jobId: JobId, result: unknown): Promise<void> {
		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, JobStatus.COMPLETED, {
			result,
		});
		await this._releaseWorker(jobId);
		logger.info("Job completed", { context: { jobId } });
		this._assignmentManager.distributeNext();
	}

	async fail(jobId: JobId, error: string): Promise<void> {
		this._queue.ack(jobId);
		const job = await this._repository.findById(jobId);
		if (!job) {
			return;
		}
		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);
		if (hasExceededMaxRetries(job)) {
			await this._failureHandler.handlePermanentFailure(jobId, error);
		} else {
			await this._failureHandler.handleRetryableFailure(jobId, job, error);
		}
	}

	async cancel(jobId: JobId): Promise<void> {
		const job = await this._repository.findById(jobId);
		if (!job) {
			return;
		}
		this._assertCancellable(job);
		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, JobStatus.CANCELLED);
		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);
		logger.info("Job cancelled", { context: { jobId } });
	}

	private async _releaseWorker(jobId: JobId): Promise<void> {
		const job = await this._repository.findById(jobId);
		this._assignmentManager.decrementWorkerLoad(job?.assignedWorkerId);
	}

	private _assertCancellable(job: Pick<Job, "status">): void {
		if (
			job.status === JobStatus.RUNNING ||
			job.status === JobStatus.COMPLETED
		) {
			throw new Error("Cannot cancel a running or completed job");
		}
	}
}
