import { logger } from "@trading-model/common/config/logger";
import {
	type JobId,
	PositiveInt,
} from "@trading-model/common/domain/primitives";
import {
	isTerminalStatus,
	JobStatus,
} from "@trading-model/validation/contracts/recovery.types";

import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
import type { InternalQueue } from "./internal-queue";
import type { JobAssignmentManager } from "./job-assignment-manager";

export interface JobFailureHandlerDeps {
	queue: InternalQueue;
	repository: JobRepository;
	reAllocator: ReAllocator;
	assignmentManager: JobAssignmentManager;
}

export class JobFailureHandler {
	private readonly _queue: InternalQueue;
	private readonly _repository: JobRepository;
	private readonly _reAllocator: ReAllocator;
	private readonly _assignmentManager: JobAssignmentManager;

	constructor(deps: JobFailureHandlerDeps) {
		this._queue = deps.queue;
		this._repository = deps.repository;
		this._reAllocator = deps.reAllocator;
		this._assignmentManager = deps.assignmentManager;
	}

	handleAckTimeout(jobId: JobId): void {
		logger.warn("ACK timeout for job", { context: { jobId } });

		this._repository
			.findById(jobId)
			.then((job) => this._onAckTimeoutJobFound(job, jobId))
			.catch((err) => {
				this._logFindJobError(jobId, err);
			});
	}

	async handlePermanentFailure(jobId: JobId, error: string): Promise<void> {
		await this._repository.updateStatus(jobId, JobStatus.FAILED, { error });
		logger.warn("Job failed permanently", { context: { jobId, error } });
	}

	async handleRetryableFailure(
		jobId: JobId,
		job: Job,
		_error: string
	): Promise<void> {
		const newDeadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const updatedJob = this._buildRetryJob(job, newDeadline);
		this._queue.enqueue(updatedJob);
		await this._repository.incrementRetry(jobId);
		await this._repository.updateStatus(jobId, JobStatus.QUEUED, {
			ackDeadline: PositiveInt.of(newDeadline),
		});
		logger.info("Job re-queued after failure", {
			context: { jobId, retryCount: updatedJob.retryCount },
		});
		this._assignmentManager.distributeNext();
	}

	private _buildRetryJob(job: Job, newDeadline: number): Job {
		return {
			...job,
			status: JobStatus.QUEUED,
			ackDeadline: PositiveInt.of(newDeadline),
			retryCount: PositiveInt.next(job.retryCount),
			assignedWorkerId: undefined,
		};
	}

	private _logFindJobError(jobId: JobId, err: unknown): void {
		logger.error("Failed to find job on ACK timeout", {
			context: {
				jobId,
				error: String(err),
			},
		});
	}

	private _onAckTimeoutJobFound(job: Job | null, jobId: JobId): void {
		if (!job || isTerminalStatus(job.status)) {
			return;
		}

		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

		this._repository
			.updateStatus(jobId, JobStatus.ORPHANED)
			.then(() => this._reAllocator.reallocate(job))
			.catch((err) =>
				logger.error("Failed to persist orphaned status on ACK timeout", {
					jobId,
					error: String(err),
				})
			);
	}
}
