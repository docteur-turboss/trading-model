import type { BackPressure } from "./back-pressure";
import type { WorkerRegistry } from "../worker/worker-registry";

export class WorkerLoadUpdater {
	constructor(
		private readonly _backPressure: BackPressure,
		private readonly _workers: WorkerRegistry,
	) {}

	decrement(workerId: string | undefined): void {
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
