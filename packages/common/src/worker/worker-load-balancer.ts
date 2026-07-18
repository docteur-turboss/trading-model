import {
	isWorkerSuitable,
	type WorkerRegistration,
} from "@trading-model/validation/contracts/worker-protocol.types";
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
		for (const worker of this._store.values()) {
			if (!isWorkerSuitable(worker, jobType)) {
				continue;
			}
			best = _pickLowerLoad(worker, best, bestLoad);
			if (best === worker) {
				bestLoad = worker.currentLoad;
			}
		}
		return best;
	}
}
