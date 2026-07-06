import type { JobRepository } from "../persistence/job-repository";
import type { IWorkerProtocol } from "../worker/worker-protocol";
import type { WorkerRegistry } from "../worker/worker-registry";
import type { BackPressure } from "./back-pressure";
import type { InternalQueue } from "./internal-queue";
import { JobAssigner } from "./job-assigner";

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
	private readonly _assigner: JobAssigner;

	constructor(deps: JobAssignmentManagerDeps) {
		this._queue = deps.queue;
		this._backPressure = deps.backPressure;
		this._workers = deps.workers;
		this._assigner = new JobAssigner(
			deps.queue,
			deps.backPressure,
			deps.repository
		);
	}

	setWorkerProtocol(protocol: IWorkerProtocol): void {
		this._assigner.setWorkerProtocol(protocol);
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

		this._assigner.assign(queued, worker);
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
}
