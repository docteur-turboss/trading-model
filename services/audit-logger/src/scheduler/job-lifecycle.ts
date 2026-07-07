import { randomUUID } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import { JOB_STATUS } from "@trading-model/common/contracts/recovery.types";
import { type JobId, toJobType } from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { type Job, JobPriority } from "../types/job.types";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";
import type { JobAssignmentManager } from "./job-assignment-manager";
import type { JobFailureHandler } from "./job-failure-handler";
import { JobStatusManager } from "./job-status-manager";

export class JobLifecycle {
	private readonly _statusManager: JobStatusManager;

	constructor(
		private readonly _queue: InternalQueue,
		private readonly _backPressure: BackPressure,
		private readonly _repository: JobRepository,
		private readonly _assignmentManager: JobAssignmentManager,
		private readonly _failureHandler: JobFailureHandler
	) {
		this._statusManager = new JobStatusManager(
			this._queue,
			this._repository,
			this._assignmentManager,
			this._failureHandler
		);
	}

	async submit(type: string, payload: unknown, priority: JobPriority = JobPriority.MEDIUM, maxRetries: number = ENV.MAX_RETRIES_PER_JOB): Promise<string> {
		this._checkBackPressure();
		const job = this._createJob(type, payload, priority, maxRetries);
		await this._repository.insert(job);
		this._enqueueJob(job);
		logger.info("Job submitted", { context: { jobId: job.id, type, priority } });
		return job.id;
	}

	private _checkBackPressure(): void {
		if (!this._backPressure.canAccept()) {
			logger.warn("Back pressure active — rejecting job submission");
			throw Object.assign(new Error("Job scheduler at capacity"), {
				code: "BACK_PRESSURE",
				retryAfter: this._backPressure.retryAfterSeconds(),
			});
		}
	}

	private _createJob(type: string, payload: unknown, priority: JobPriority, maxRetries: number): Job {
		return {
			id: randomUUID() as JobId,
			type: toJobType(type),
			payload,
			priority,
			status: JOB_STATUS.PENDING,
			ackDeadline: 0,
			maxRetries,
			retryCount: 0,
			createdAt: new Date(),
			history: [],
		};
	}

	private _enqueueJob(job: Job): void {
		const updated: Job = { ...job, status: JOB_STATUS.QUEUED };
		this._queue.enqueue(updated);
		this._backPressure.updateQueueDepth(this._queue.depth());
		this._repository.updateStatus(job.id, JOB_STATUS.QUEUED).catch((err) => {
			logger.error("Failed to persist queued status", {
				context: {
					jobId: job.id,
					error: String(err),
				},
			});
		});
		this._assignmentManager.distributeNext();
	}

	async ack(jobId: JobId): Promise<void> {
		await this._statusManager.ack(jobId);
	}

	async complete(jobId: JobId, result: unknown): Promise<void> {
		await this._statusManager.complete(jobId, result);
	}

	async fail(jobId: JobId, error: string): Promise<void> {
		await this._statusManager.fail(jobId, error);
	}

	async cancel(jobId: JobId): Promise<void> {
		await this._statusManager.cancel(jobId);
	}
}
