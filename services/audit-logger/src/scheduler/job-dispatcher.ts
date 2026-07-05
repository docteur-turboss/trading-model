import { logger } from "@trading-model/common/config/logger";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { Job } from "../types/job.types";
import type { WorkerProtocol } from "../worker/worker-protocol";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";
import type { ReAllocator } from "../recovery/re-allocator";

export interface JobDispatcherDeps {
	queue: InternalQueue;
	backPressure: BackPressure;
	workers: WorkerRegistry;
	repository: JobRepository;
	reAllocator: ReAllocator;
}

export class JobDispatcher {
	private readonly _queue: InternalQueue;
	private readonly _backPressure: BackPressure;
	private readonly _workers: WorkerRegistry;
	private readonly _repository: JobRepository;
	private readonly _reAllocator: ReAllocator;
	private _workerProtocol: WorkerProtocol | null = null;

	constructor(deps: JobDispatcherDeps) {
		this._queue = deps.queue;
		this._backPressure = deps.backPressure;
		this._workers = deps.workers;
		this._repository = deps.repository;
		this._reAllocator = deps.reAllocator;
		this._queue.setOnAckTimeout((jobId) => {
			this._handleAckTimeout(jobId);
		});
	}

	setWorkerProtocol(protocol: WorkerProtocol): void {
		this._workerProtocol = protocol;
	}

	assignJob(
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

		this._queue.markDelivered(assignedJob.id);
		this._sendAssignment(worker.workerId, assignedJob, deadline);
		this._incrementWorkerLoad(worker);
		this._persistAssignment(assignedJob.id, worker.workerId, deadline);

		logger.info("Job assigned to worker", {
			jobId: assignedJob.id,
			workerId: worker.workerId,
		});
	}

	distributeNext(): void {
		const queued = this._queue.dequeue();
		if (!queued) {
			return;
		}

		const worker = this._workers.findBestWorker(queued.job.type);
		if (!worker) {
			this._queue.enqueue(queued.job);
			return;
		}

		this.assignJob(queued, worker);
	}

	decrementWorkerLoad(workerId: string | undefined): void {
		if (!workerId) {
			return;
		}
		const worker = this._workers.get(workerId);
		if (!worker) {
			return;
		}
		worker.currentLoad = Math.max(0, worker.currentLoad - 1);
		this._backPressure.updateWorkerLoad(
			workerId,
			worker.currentLoad / worker.maxConcurrency
		);
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
		this._backPressure.updateWorkerLoad(
			worker.workerId,
			worker.currentLoad / worker.maxConcurrency
		);
	}

	private _persistAssignment(
		jobId: string,
		assignedWorkerId: string,
		deadline: number
	): void {
		this._repository
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

	private _handleAckTimeout(jobId: string): void {
		logger.warn("ACK timeout for job", { jobId });

		this._repository
			.findById(jobId)
			.then((job) => {
				if (
					!job ||
					job.status === "completed" ||
					job.status === "failed" ||
					job.status === "cancelled"
				) {
					return;
				}

				this.decrementWorkerLoad(job.assignedWorkerId);

				this._repository
					.updateStatus(jobId, "orphaned")
					.then(() => this._reAllocator.reallocate(job))
					.catch((err) =>
						logger.error(
							"Failed to persist orphaned status on ACK timeout",
							{
								jobId,
								error: String(err),
							}
						)
					);
			})
			.catch((err) => {
				logger.error("Failed to find job on ACK timeout", {
					jobId,
					error: String(err),
				});
			});
	}
}
