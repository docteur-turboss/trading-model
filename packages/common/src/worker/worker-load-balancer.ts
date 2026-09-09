import {
	isWorkerSuitable,
	type WorkerRegistration,
} from "../contracts/worker-protocol-types";
import { Capability } from "../domain/primitives";
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
		const wanted = Capability.of(jobType);
		let best: WorkerRegistration | null = null;
		let bestLoad = Number.POSITIVE_INFINITY;
		for (const worker of this._store.values()) {
			if (!isWorkerSuitable(worker, wanted)) {
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
