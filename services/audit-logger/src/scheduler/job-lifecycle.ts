import { randomUUID } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import { JobStatus } from "@trading-model/common/contracts/recovery.types";
import {
	JobId,
	type JobType,
	PositiveInt,
	toJobType,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { type Job, JobPriority } from "../types/job.types";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";
import type { JobAssignmentManager } from "./job-assignment-manager";
import type { JobFailureHandler } from "./job-failure-handler";
import { JobStatusManager } from "./job-status-manager";

export interface JobLifecycleDeps {
	queue: InternalQueue;
	backPressure: BackPressure;
	repository: JobRepository;
	assignmentManager: JobAssignmentManager;
	failureHandler: JobFailureHandler;
}

export class JobLifecycle {
	private readonly _statusManager: JobStatusManager;

	constructor(private readonly _deps: JobLifecycleDeps) {
		this._statusManager = new JobStatusManager(this._deps);
	}

	private get _queue(): InternalQueue {
		return this._deps.queue;
	}
	private get _backPressure(): BackPressure {
		return this._deps.backPressure;
	}
	private get _repository(): JobRepository {
		return this._deps.repository;
	}
	private get _assignmentManager(): JobAssignmentManager {
		return this._deps.assignmentManager;
	}

	async submit(
		type: JobType,
		payload: unknown,
		priority: JobPriority = JobPriority.MEDIUM,
		maxRetries: number = ENV.MAX_RETRIES_PER_JOB
	): Promise<string> {
		this._checkBackPressure();
		const job = this._createJob(type, payload, priority, maxRetries);
		await this._repository.insert(job);
		this._enqueueJob(job);
		logger.info("Job submitted", {
			context: { jobId: job.id, type, priority },
		});
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

	private _createJob(
		type: JobType,
		payload: unknown,
		priority: JobPriority,
		maxRetries: number
	): Job {
		return {
			id: JobId.of(randomUUID()),
			type: toJobType(type),
			payload,
			priority,
			status: JobStatus.PENDING,
			ackDeadline: PositiveInt.of(Date.now() + ENV.ACK_TIMEOUT_MS),
			maxRetries: PositiveInt.of(maxRetries || 1),
			retryCount: 0 as unknown as PositiveInt,
			createdAt: UnixTimestamp.now(),
			history: [],
		};
	}

	private _enqueueJob(job: Job): void {
		const updated: Job = { ...job, status: JobStatus.QUEUED };
		this._queue.enqueue(updated);
		this._backPressure.updateQueueDepth(this._queue.depth());
		this._repository.updateStatus(job.id, JobStatus.QUEUED).catch((err) => {
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
