import type { JobId } from "@trading-model/primitives/primitives";
import type { JobRepositoryPort } from "../../domain/ports/job-repository.port";
import type { WorkerProtocolPort } from "../../domain/ports/worker-protocol.port";
import type { BackPressure } from "../../domain/scheduler/back-pressure";
import type { InternalQueue } from "../../domain/scheduler/internal-queue";
import { JobAssigner } from "./job-assigner";
import type { WorkerRegistry } from "./worker-registry";

export interface JobAssignmentManagerDeps {
	queue: InternalQueue;
	backPressure: BackPressure;
	workers: WorkerRegistry;
	repository: JobRepositoryPort;
	ackTimeoutMs: number;
}

export class JobAssignmentManager {
	private readonly _queue: InternalQueue;
	private readonly _backPressure: BackPressure;
	private readonly _workers: WorkerRegistry;
	private readonly _assigner: JobAssigner;

	constructor(deps: JobAssignmentManagerDeps) {
		this._queue = deps.queue;
		this._backPressure = deps.backPressure;
		this._workers = deps.workers;
		this._assigner = new JobAssigner(
			deps.queue,
			deps.backPressure,
			deps.repository,
			deps.ackTimeoutMs
		);
	}

	setWorkerProtocol(protocol: WorkerProtocolPort): void {
		this._assigner.setWorkerProtocol(protocol);
	}

	setOnAckTimeout(handler: (jobId: JobId) => void): void {
		this._assigner.setOnAckTimeout(handler);
	}

	distributeNext(): void {
		const queued = this._queue.dequeue();
		if (!queued) {
			return;
		}

		const worker = this._workers.loadBalancer.findBestWorker(queued.job.type);
		if (!worker) {
			this._queue.enqueue(queued.job);
			return;
		}

		this._assigner.assign(queued, worker);
	}

	decrementWorkerLoad(workerId: string | undefined): void {
		if (!workerId) {
			return;
		}
		const worker = this._workers.store.get(workerId);
		if (!worker) {
			return;
		}
		worker.currentLoad = Math.max(0, worker.currentLoad - 1);
		this._backPressure.updateWorkerLoad(
			workerId,
			worker.currentLoad / worker.maxConcurrency
		);
	}
}
