import { randomUUID } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { OrphanDetector } from "../recovery/orphan-detector";
import { ReAllocator } from "../recovery/re-allocator";
import type { Job, JobPriority } from "../types/job.types";
import type { WorkerProtocol } from "../worker/worker-protocol";
import { WorkerRegistry } from "../worker/worker-registry";
import { BackPressure } from "./back-pressure";
import { InternalQueue } from "./internal-queue";
import { JobAssignmentManager } from "./job-assignment-manager";
import { JobFailureHandler } from "./job-failure-handler";

export class JobScheduler {
	readonly queue: InternalQueue;
	readonly backPressure: BackPressure;
	readonly workers: WorkerRegistry;
	readonly repository: JobRepository;
	readonly reAllocator: ReAllocator;
	readonly orphanDetector: OrphanDetector;
	private readonly _assignmentManager: JobAssignmentManager;
	private readonly _failureHandler: JobFailureHandler;
	private _workerProtocol: WorkerProtocol | null = null;

	constructor(repository: JobRepository) {
		this.queue = _createInternalQueue();
		this.backPressure = _createBackPressure();
		this.workers = _createWorkerRegistry();
		this.repository = repository;
		this.reAllocator = _createReAllocator(repository, this.queue);
		this._assignmentManager = _createAssignmentManager(
			this.queue,
			this.backPressure,
			this.workers,
			repository
		);
		this._failureHandler = _createFailureHandler(
			this.queue,
			repository,
			this.reAllocator,
			this._assignmentManager
		);
		this.orphanDetector = _createOrphanDetector(
			this.workers,
			repository,
			this.reAllocator
		);

		this._setupAckTimeout();
	}

	private _setupAckTimeout(): void {
		this.queue.setOnAckTimeout((jobId) => {
			this._failureHandler.handleAckTimeout(jobId);
		});
	}
}

function _createInternalQueue(): InternalQueue {
	return new InternalQueue(ENV.ACK_TIMEOUT_MS);
}

function _createBackPressure(): BackPressure {
	return new BackPressure(ENV.MAX_QUEUE_DEPTH, ENV.MAX_WORKER_LOAD_RATIO);
}

function _createWorkerRegistry(): WorkerRegistry {
	return new WorkerRegistry(ENV.WORKER_HEARTBEAT_TTL_MS);
}

function _createReAllocator(
	repository: JobRepository,
	queue: InternalQueue
): ReAllocator {
	return new ReAllocator(repository, queue);
}

function _createAssignmentManager(
	queue: InternalQueue,
	backPressure: BackPressure,
	workers: WorkerRegistry,
	repository: JobRepository
): JobAssignmentManager {
	return new JobAssignmentManager({
		queue,
		backPressure,
		workers,
		repository,
	});
}

function _createFailureHandler(
	queue: InternalQueue,
	repository: JobRepository,
	reAllocator: ReAllocator,
	assignmentManager: JobAssignmentManager
): JobFailureHandler {
	return new JobFailureHandler({
		queue,
		repository,
		reAllocator,
		assignmentManager,
	});
}

function _createOrphanDetector(
	workers: WorkerRegistry,
	repository: JobRepository,
	reAllocator: ReAllocator
): OrphanDetector {
	return new OrphanDetector({
		workers,
		repository,
		reAllocator,
		intervalMs: ENV.ORPHAN_SCAN_INTERVAL_MS,
	});
}

export class JobScheduler {
	setWorkerProtocol(protocol: WorkerProtocol): void {
		this._workerProtocol = protocol;
		this._assignmentManager.setWorkerProtocol(protocol);
	}

	async submit(
		type: string,
		payload: unknown,
		priority: JobPriority = 3,
		maxRetries: number = ENV.MAX_RETRIES_PER_JOB
	): Promise<string> {
		if (!this.backPressure.canAccept()) {
			logger.warn("Back pressure active — rejecting job submission");
			throw Object.assign(new Error("Job scheduler at capacity"), {
				code: "BACK_PRESSURE",
				retryAfter: this.backPressure.retryAfterSeconds(),
			});
		}

		const jobId = randomUUID();
		const now = new Date();

		const job: Job = {
			id: jobId,
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

		await this.repository.insert(job);
		this._enqueueJob(job);

		logger.info("Job submitted", { context: { jobId, type, priority } });
		return jobId;
	}

	private _enqueueJob(job: Job): void {
		const updated: Job = { ...job, status: "queued" };
		this.queue.enqueue(updated);
		this.backPressure.updateQueueDepth(this.queue.depth());
		this.repository.updateStatus(job.id, "queued").catch((err) => {
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
		this.queue.ack(jobId);
		await this.repository.updateStatus(jobId, "running");

		logger.info("Job acknowledged by worker", { context: { jobId } });
	}

	async complete(jobId: string, result: unknown): Promise<void> {
		this.queue.ack(jobId);
		await this.repository.updateStatus(jobId, "completed", { result });

		const job = await this.repository.findById(jobId);
		this._assignmentManager.decrementWorkerLoad(job?.assignedWorkerId);

		logger.info("Job completed", { context: { jobId } });
		this._assignmentManager.distributeNext();
	}

	async fail(jobId: string, error: string): Promise<void> {
		this.queue.ack(jobId);

		const job = await this.repository.findById(jobId);
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
		const job = await this.repository.findById(jobId);
		if (!job) {
			return;
		}

		if (job.status === "running" || job.status === "completed") {
			throw new Error("Cannot cancel a running or completed job");
		}

		this.queue.ack(jobId);
		await this.repository.updateStatus(jobId, "cancelled");
		this._assignmentManager.decrementWorkerLoad(job.assignedWorkerId);

		logger.info("Job cancelled", { context: { jobId } });
	}

	onWorkerDisconnect(workerId: string): void {
		this.backPressure.removeWorker(workerId);
	}

	async start(): Promise<void> {
		const nonTerminal = await this.repository.findNonTerminal();

		await this._recoverJobs(nonTerminal);
		this.backPressure.updateQueueDepth(this.queue.depth());

		_logSchedulerStart(nonTerminal.length);
		this.orphanDetector.start();
	}

	private async _recoverJobs(
		nonTerminal: import("../types/job.types").Job[]
	): Promise<void> {
		for (const job of nonTerminal) {
			if (job.status === "queued" || job.status === "pending") {
				this.queue.enqueue({ ...job, status: "queued" });
			} else if (job.status === "assigned" || job.status === "running") {
				await this.repository.updateStatus(job.id, "orphaned");
				await this.reAllocator.reallocate(job);
			} else if (job.status === "orphaned") {
				await this.reAllocator.reallocate(job);
			}
		}
	}
}

function _logSchedulerStart(recovered: number): void {
	logger.info("Job scheduler started — recovered jobs from persistence", {
		recovered,
	});
}

stop();
: void
{
	this.orphanDetector.stop();
	this.queue.stop();
	if (this._workerProtocol) {
		this._workerProtocol.close();
	}

	logger.info("Audit job scheduler stopped");
}
}

function _logSchedulerStart(recovered: number): void {
