import { logger } from "@trading-model/common/config/logger";
import { isTerminalStatus } from "@trading-model/common/contracts/recovery.types";

import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
import type { JobAssignmentManager } from "./job-assignment-manager";
import { InternalQueue } from "./internal-queue";

export class JobFailureHandler {
	constructor(
		private readonly _queue: InternalQueue,
		private readonly _repository: JobRepository,
		private readonly _reAllocator: ReAllocator,
		private readonly _assignmentManager: JobAssignmentManager
	) {}

	async handleAckTimeout(jobId: string): Promise<void> {
		logger.warn("ACK timeout for job", { context: { jobId } });

		this._repository
			.findById(jobId)
			.then((job) => {
				if (
					!job ||
					isTerminalStatus(job.status)
				) {
					return;
				}

				this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

				this._repository
					.updateStatus(jobId, "orphaned")
					.then(() => this._reAllocator.reallocate(job))
					.catch((err) =>
						logger.error("Failed to persist orphaned status on ACK timeout", {
							jobId,
							error: String(err),
						})
					);
			})
			.catch((err) => {
				logger.error("Failed to find job on ACK timeout", { context: {
				jobId,
				error: String(err),
			} });
			});
	}

	async handlePermanentFailure(jobId: string, error: string): Promise<void> {
		await this._repository.updateStatus(jobId, "failed", { error });
		logger.warn("Job failed permanently", { context: { jobId, error } });
	}

	async handleRetryableFailure(
		jobId: string,
		job: Job,
		_error: string
	): Promise<void> {
		const newDeadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const updatedJob: Job = {
			...job,
			status: "queued",
			ackDeadline: newDeadline,
			retryCount: job.retryCount + 1,
			assignedWorkerId: undefined,
		};

		this._queue.enqueue(updatedJob);
		await this._repository.incrementRetry(jobId);
		await this._repository.updateStatus(jobId, "queued", {
			ackDeadline: newDeadline,
		});

		logger.info("Job re-queued after failure", { context: {
			jobId,
			retryCount: updatedJob.retryCount,
		} });
		this._assignmentManager.distributeNext();
	}
}
