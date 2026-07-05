import { randomUUID } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import { isTerminalStatus } from "@trading-model/common/contracts/recovery.types";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import { OrphanDetector } from "../recovery/orphan-detector";
import { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
import type { WorkerProtocol } from "../worker/worker-protocol";
import { WorkerRegistry } from "../worker/worker-registry";
import { BackPressure } from "./back-pressure";
import { InternalQueue } from "./internal-queue";

export class JobScheduler {
	readonly queue: InternalQueue;
	readonly backPressure: BackPressure;
	readonly workers: WorkerRegistry;
	readonly repository: JobRepository;
	readonly reAllocator: ReAllocator;
	readonly orphanDetector: OrphanDetector;
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
		this.orphanDetector = new OrphanDetector({
			workers: this.workers,
			repository,
			reAllocator: this.reAllocator,
			intervalMs: ENV.ORPHAN_SCAN_INTERVAL_MS,
		});

		this.queue.setOnAckTimeout((jobId) => {
			this._handleAckTimeout(jobId);
		});
	}

	setWorkerProtocol(protocol: WorkerProtocol): void {
		this._workerProtocol = protocol;
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

		logger.info("Job submitted", { jobId, type, priority });
		return jobId;
	}

	private _enqueueJob(job: Job): void {
		const updated: Job = { ...job, status: "queued" };
		this.queue.enqueue(updated);
		this.backPressure.updateQueueDepth(this.queue.depth());
		this.repository.updateStatus(job.id, "queued").catch((err) => {
			logger.error("Failed to persist queued status", {
				jobId: job.id,
				error: String(err),
			});
		});
		this._distributeNext();
	}

	private _assignJob(
		queued: { job: Job },
		worker: { workerId: string; currentLoad: number; maxConcurrency: number }
	): void {
		const deadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const assignedJob: Job = {
			...queued.job,
			status: "assigned",
			assignedWorkerId: worker.workerId,
			ackDeadline: deadline,
		};

		this.queue.markDelivered(assignedJob.id);
		this._sendAssignment(worker.workerId, assignedJob, deadline);
		this._incrementWorkerLoad(worker);
		this._persistAssignment(assignedJob.id, worker.workerId, deadline);

		logger.info("Job assigned to worker", {
			jobId: assignedJob.id,
			workerId: worker.workerId,
		});
	}

	private _sendAssignment(workerId: string, job: Job, deadline: number): void {
		if (!this._workerProtocol) {
			return;
		}
		this._workerProtocol.sendToWorker(workerId, {
			type: "job.assigned",
			job: {
				id: job.id,
				type: job.type,
				payload: job.payload,
				ackDeadline: deadline,
			},
		});
	}

	private _incrementWorkerLoad(worker: {
		workerId: string;
		currentLoad: number;
		maxConcurrency: number;
	}): void {
		worker.currentLoad += 1;
		this.backPressure.updateWorkerLoad(
			worker.workerId,
			worker.currentLoad / worker.maxConcurrency
		);
	}

	private _decrementWorkerLoad(workerId: string | undefined): void {
		if (!workerId) {
			return;
		}
		const worker = this.workers.get(workerId);
		if (!worker) {
			return;
		}
		worker.currentLoad = Math.max(0, worker.currentLoad - 1);
		this.backPressure.updateWorkerLoad(
			workerId,
			worker.currentLoad / worker.maxConcurrency
		);
	}

	private _persistAssignment(
		jobId: string,
		assignedWorkerId: string,
		deadline: number
	): void {
		this.repository
			.updateStatus(jobId, "assigned", {
				assignedWorkerId,
				ackDeadline: deadline,
			})
			.catch((err) => {
				logger.error("Failed to persist assigned status", {
					jobId,
					error: String(err),
				});
			});
	}

	private _distributeNext(): void {
		const queued = this.queue.dequeue();
		if (!queued) {
			return;
		}

		const worker = this.workers.findBestWorker(queued.job.type);
		if (!worker) {
			this.queue.enqueue(queued.job);
			return;
		}

		this._assignJob(queued, worker);
	}

	private _handleAckTimeout(jobId: string): void {
		logger.warn("ACK timeout for job", { jobId });

		this.repository
			.findById(jobId)
			.then((job) => {
				if (
					!job ||
					isTerminalStatus(job.status)
				) {
					return;
				}

				this._decrementWorkerLoad(job.assignedWorkerId);

				this.repository
					.updateStatus(jobId, "orphaned")
					.then(() => this.reAllocator.reallocate(job))
					.catch((err) =>
						logger.error("Failed to persist orphaned status on ACK timeout", {
							jobId,
							error: String(err),
						})
					);
			})
			.catch((err) => {
				logger.error("Failed to find job on ACK timeout", {
					jobId,
					error: String(err),
				});
			});
	}

	async ack(jobId: string): Promise<void> {
		this.queue.ack(jobId);
		await this.repository.updateStatus(jobId, "running");

		logger.info("Job acknowledged by worker", { jobId });
	}

	async complete(jobId: string, result: unknown): Promise<void> {
		this.queue.ack(jobId);
		await this.repository.updateStatus(jobId, "completed", { result });

		const job = await this.repository.findById(jobId);
		this._decrementWorkerLoad(job?.assignedWorkerId);

		logger.info("Job completed", { jobId });
		this._distributeNext();
	}

	private async _handlePermanentFailure(
		jobId: string,
		error: string
	): Promise<void> {
		await this.repository.updateStatus(jobId, "failed", { error });
		logger.warn("Job failed permanently", { jobId, error });
	}

	private async _handleRetryableFailure(
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

		this.queue.enqueue(updatedJob);
		await this.repository.incrementRetry(jobId);
		await this.repository.updateStatus(jobId, "queued", {
			ackDeadline: newDeadline,
		});

		logger.info("Job re-queued after failure", {
			jobId,
			retryCount: updatedJob.retryCount,
		});
		this._distributeNext();
	}

	async fail(jobId: string, error: string): Promise<void> {
		this.queue.ack(jobId);

		const job = await this.repository.findById(jobId);
		if (!job) {
			return;
		}

		this._decrementWorkerLoad(job.assignedWorkerId);

		if (job.retryCount >= job.maxRetries) {
			await this._handlePermanentFailure(jobId, error);
		} else {
			await this._handleRetryableFailure(jobId, job, error);
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
		this._decrementWorkerLoad(job.assignedWorkerId);

		logger.info("Job cancelled", { jobId });
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
