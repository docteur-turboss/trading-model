import { logger } from "@trading-model/common/config/logger";
import { ENV } from "../config/env";
import type { JobRepository } from "../persistence/job-repository";
import type { ReAllocator } from "../recovery/re-allocator";
import type { Job } from "../types/job.types";
import type { WorkerRegistration } from "@trading-model/common/contracts/worker-protocol.types";
import { NullWorkerProtocol, type IWorkerProtocol } from "../worker/worker-protocol";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";
import { AckTimeoutHandler } from "./ack-timeout-handler";

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
	private readonly _ackTimeoutHandler: AckTimeoutHandler;
	private readonly _onAckTimeout: (jobId: string) => void;
	private _workerProtocol: IWorkerProtocol = new NullWorkerProtocol();

	constructor(deps: JobDispatcherDeps) {
		this._queue = deps.queue;
		this._backPressure = deps.backPressure;
		this._workers = deps.workers;
		this._ackTimeoutHandler = new AckTimeoutHandler(
			deps.repository,
			deps.workers,
			deps.backPressure,
			deps.reAllocator,
		);
		this._onAckTimeout = (jobId) => this._ackTimeoutHandler.onTimeout(jobId);
	}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._workerProtocol = protocol;
	}

	assignJob(
		queued: { job: Job },
		worker: Pick<WorkerRegistration, "workerId" | "currentLoad" | "maxConcurrency">
	): void {
		const deadline = Date.now() + ENV.ACK_TIMEOUT_MS;
		const assignedJob: Job = {
			...queued.job,
			status: "assigned",
			assignedWorkerId: worker.workerId,
			ackDeadline: deadline,
		};

		this._queue.markDelivered(assignedJob.id, this._onAckTimeout);
		this._sendAssignment(worker.workerId, assignedJob, deadline);
		this._incrementWorkerLoad(worker);
		this._ackTimeoutHandler.persistAssignment(assignedJob.id, worker.workerId, deadline);

		logger.info("Job assigned to worker", {
			context: {
				jobId: assignedJob.id,
				workerId: worker.workerId,
			},
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
}
