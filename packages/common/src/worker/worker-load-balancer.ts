import type { WorkerRegistration } from "@trading-model/validation/contracts/worker-protocol.types";
import { Capability, WorkerStatusCode } from "../domain/primitives";
import type { WorkerStore } from "./worker-store";

function _pickLowerLoad(
	candidate: WorkerRegistration,
	best: WorkerRegistration | null,
	bestLoad: number
): WorkerRegistration | null {
	if (candidate.currentLoad < bestLoad) {
		return candidate;
	}
	return best;
}

export class WorkerLoadBalancer {
	constructor(private readonly _store: WorkerStore) {}

	findBestWorker(jobType: string): WorkerRegistration | null {
		let best: WorkerRegistration | null = null;
		let bestLoad = Number.POSITIVE_INFINITY;
		for (const worker of this._store.all().values()) {
			if (!this._isWorkerSuitable(worker, jobType)) {
				continue;
			}
			best = _pickLowerLoad(worker, best, bestLoad);
			if (best === worker) {
				bestLoad = worker.currentLoad;
			}
		}
		return best;
	}

	private _isWorkerSuitable(
		worker: WorkerRegistration,
		jobType: string
	): boolean {
		return (
			worker.status === WorkerStatusCode.Active &&
			worker.capabilities.includes(Capability.of(jobType)) &&
			worker.currentLoad < worker.maxConcurrency
		);
	}
}
