import { logger } from "@trading-model/common/config/logger";

import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { Job } from "../types/job.types";
import type { WorkerProtocol } from "../worker/worker-protocol";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";

export interface JobAssignmentManagerDeps {
	queue: InternalQueue;
	backPressure: BackPressure;
	workers: WorkerRegistry;
	repository: JobRepository;
}

export class JobAssignmentManager {
	private readonly _queue: InternalQueue;
	private readonly _backPressure: BackPressure;
	private readonly _workers: WorkerRegistry;
	private readonly _repository: JobRepository;
	private _workerProtocol: WorkerProtocol | null = null;

	constructor(deps: JobAssignmentManagerDeps) {
		this._queue = deps.queue;
		this._backPressure = deps.backPressure;
		this._workers = deps.workers;
		this._repository = deps.repository;
	}

	setWorkerProtocol(protocol: WorkerProtocol): void {
		this._workerProtocol = protocol;
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

		this._assignJob(queued, worker);
	}

	incrementWorkerLoad(worker: {
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

	sendAssignment(workerId: string, job: Job, deadline: number): void {
		if (!this._workerProtocol) {
			return;
		}
		_sendAssignmentMessage(this._workerProtocol, workerId, job, deadline);
	}
}

function _sendAssignmentMessage(
	protocol: NonNullable<JobAssignmentManager["_workerProtocol"]>,
	workerId: string,
	job: Job,
	deadline: number
): void {
	protocol.sendToWorker(workerId, {
		type: "job.assigned",
		job: {
			id: job.id,
			type: job.type,
			payload: job.payload,
			ackDeadline: deadline,
		},
	});
}

private
_assignJob(
		queued: { job: Job },
		worker: { workerId: string;
currentLoad: number;
maxConcurrency: number;
}
	): void
{
	const deadline = Date.now() + ENV.ACK_TIMEOUT_MS;
	const assignedJob: Job = {
		...queued.job,
		status: "assigned",
		assignedWorkerId: worker.workerId,
		ackDeadline: deadline,
	};

	this._queue.markDelivered(assignedJob.id);
	this.sendAssignment(worker.workerId, assignedJob, deadline);
	this.incrementWorkerLoad(worker);
	this._persistAssignment(assignedJob.id, worker.workerId, deadline);

	logger.info("Job assigned to worker", {
		context: {
			jobId: assignedJob.id,
			workerId: worker.workerId,
		},
	});
}

private
_persistAssignment(
		jobId: string,
		assignedWorkerId: string,
		deadline: number
	)
: void
{
	this._repository
		.updateStatus(jobId, "assigned", {
			assignedWorkerId,
			ackDeadline: deadline,
		})
		.catch((err) => {
			logger.error("Failed to persist assigned status", {
				context: {
					jobId,
					error: String(err),
				},
			});
		});
}
