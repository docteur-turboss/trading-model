import type { WorkerRegistration } from "../contracts/worker-protocol.types";
import { WorkerStatusCode } from "../domain/primitives";
import type { WorkerStore } from "./worker-store";

export class WorkerHealthMonitor {
	constructor(private readonly _store: WorkerStore) {}

	purgeStaleWorkers(): string[] {
		return this._store.purgeStaleWorkers();
	}

	averageLoad(): number {
		if (this._store.size() === 0) {
			return 0;
		}
		let total = 0;
		for (const worker of this._store.all().values()) {
			if (worker.maxConcurrency > 0) {
				total += worker.currentLoad / worker.maxConcurrency;
			}
		}
		return total / this._store.size();
	}

	getAllActive(): WorkerRegistration[] {
		return Array.from(this._store.all().values()).filter(
			(registration) => registration.status === WorkerStatusCode.Active
		);
	}
}
