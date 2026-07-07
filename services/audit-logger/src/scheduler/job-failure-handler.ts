import { logger } from "@trading-model/common/config/logger";
import { isTerminalStatus, JOB_STATUS } from "@trading-model/common/contracts/recovery.types";
import type { JobId } from "@trading-model/common/domain/primitives";

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
			.then((job) => _onAckTimeoutJobFound(job, jobId, this))
			.catch((err) => {
				_logFindJobError(jobId, err);
			});
	}

	async handlePermanentFailure(jobId: JobId, error: string): Promise<void> {
		await this._repository.updateStatus(jobId, JOB_STATUS.FAILED, { error });
		logger.warn("Job failed permanently", { context: { jobId, error } });
	}

	async handleRetryableFailure(
		jobId: JobId,
		job: Job,
		_error: string
	): Promise<void> {
		const newDeadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const updatedJob: Job = {
			...job,
			status: JOB_STATUS.QUEUED,
			ackDeadline: newDeadline,
			retryCount: job.retryCount + 1,
			assignedWorkerId: undefined,
		};

		this._queue.enqueue(updatedJob);
		await this._repository.incrementRetry(jobId);
		await this._repository.updateStatus(jobId, JOB_STATUS.QUEUED, {
			ackDeadline: newDeadline,
		});

		logger.info("Job re-queued after failure", {
			context: {
				jobId,
				retryCount: updatedJob.retryCount,
			},
		});
		this._assignmentManager.distributeNext();
	}
}

function _logFindJobError(jobId: JobId, err: unknown): void {
	logger.error("Failed to find job on ACK timeout", {
		context: {
			jobId,
			error: String(err),
		},
	});
}

function _onAckTimeoutJobFound(
	job: Job | null,
	jobId: JobId,
	self: JobFailureHandler
): void {
	if (!job || isTerminalStatus(job.status)) {
		return;
	}

	self._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

	self._repository
		.updateStatus(jobId, JOB_STATUS.ORPHANED)
		.then(() => self._reAllocator.reallocate(job))
		.catch((err) =>
			logger.error("Failed to persist orphaned status on ACK timeout", {
				jobId,
				error: String(err),
			})
		);
}
