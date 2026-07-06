import { randomUUID } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { OrphanDetector } from "../recovery/orphan-detector";
import { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
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
		this.queue = new InternalQueue(ENV.ACK_TIMEOUT_MS);
		this.backPressure = new BackPressure(
			ENV.MAX_QUEUE_DEPTH,
			ENV.MAX_WORKER_LOAD_RATIO
		);
		this.workers = new WorkerRegistry(ENV.WORKER_HEARTBEAT_TTL_MS);
		this.repository = repository;
		this.reAllocator = new ReAllocator(repository, this.queue);
		this._assignmentManager = new JobAssignmentManager({
			queue: this.queue,
			backPressure: this.backPressure,
			workers: this.workers,
			repository,
		});
		this._failureHandler = new JobFailureHandler({
			queue: this.queue,
			repository,
			reAllocator: this.reAllocator,
			assignmentManager: this._assignmentManager,
		});
		this.orphanDetector = new OrphanDetector({
			workers: this.workers,
			repository,
			reAllocator: this.reAllocator,
			intervalMs: ENV.ORPHAN_SCAN_INTERVAL_MS,
		});

		this.queue.setOnAckTimeout((jobId) => {
			this._failureHandler.handleAckTimeout(jobId);
		});
	}

	setWorkerProtocol(protocol: WorkerProtocol): void {
		this._workerProtocol = protocol;
		this._assignmentManager.setWorkerProtocol(protocol);
	}

	async submit(
		type: string,
		payload: unknown,
		priority: 1 | 2 | 3 | 4 | 5 = 3,
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
			logger.error("Failed to persist queued status", { context: {
				jobId: job.id,
				error: String(err),
			} });
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

		this.backPressure.updateQueueDepth(this.queue.depth());

		logger.info("Job scheduler started — recovered jobs from persistence", {
			recovered: nonTerminal.length,
		});

		this.orphanDetector.start();
	}

	stop(): void {
		this.orphanDetector.stop();
		this.queue.stop();
		if (this._workerProtocol) {
			this._workerProtocol.close();
		}

		logger.info("Audit job scheduler stopped");
	}
}
