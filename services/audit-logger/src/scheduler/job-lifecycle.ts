import { randomUUID } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import type { JobId } from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { JOB_STATUS, type Job, JobPriority } from "../types/job.types";
import type { JobAssignmentManager } from "./job-assignment-manager";
import type { JobFailureHandler } from "./job-failure-handler";
import { BackPressure } from "./back-pressure";
import { InternalQueue } from "./internal-queue";

export class JobLifecycle {
	constructor(
		private readonly _queue: InternalQueue,
		private readonly _backPressure: BackPressure,
		private readonly _repository: JobRepository,
		private readonly _assignmentManager: JobAssignmentManager,
		private readonly _failureHandler: JobFailureHandler,
	) {}

	async submit(
		type: string,
		payload: unknown,
		priority: JobPriority = JobPriority.MEDIUM,
		maxRetries: number = ENV.MAX_RETRIES_PER_JOB
	): Promise<string> {
		if (!this._backPressure.canAccept()) {
			logger.warn("Back pressure active — rejecting job submission");
			throw Object.assign(new Error("Job scheduler at capacity"), {
				code: "BACK_PRESSURE",
				retryAfter: this._backPressure.retryAfterSeconds(),
			});
		}

		const jobId = randomUUID();
		const now = new Date();

		const job: Job = {
			id: jobId as JobId,
			type,
			payload,
			priority,
			status: "pending",
			ackDeadline: 0,
			maxRetries,
			retryCount: 0,
			createdAt: now,
			history: [],
		};

		await this._repository.insert(job);
		this._enqueueJob(job);

		logger.info("Job submitted", { context: { jobId, type, priority } });
		return jobId;
	}

	private _enqueueJob(job: Job): void {
		const updated: Job = { ...job, status: "queued" };
		this._queue.enqueue(updated);
		this._backPressure.updateQueueDepth(this._queue.depth());
		this._repository.updateStatus(job.id, "queued").catch((err) => {
			logger.error("Failed to persist queued status", {
				context: {
					jobId: job.id,
					error: String(err),
				},
			});
		});
		this._assignmentManager.distributeNext();
	}

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

		if (job.status === JOB_STATUS.RUNNING || job.status === JOB_STATUS.COMPLETED) {
			throw new Error("Cannot cancel a running or completed job");
		}

		this._queue.ack(jobId);
		await this._repository.updateStatus(jobId, JOB_STATUS.CANCELLED);
		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

		logger.info("Job cancelled", { context: { jobId } });
	}
}
