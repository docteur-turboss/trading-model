import type { WorkerRegistration } from "../contracts/worker-protocol.types";
import { WorkerStore } from "./worker-store";

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

export class WorkerRegistry {
	private readonly _store: WorkerStore;

	constructor(heartbeatTtlMs: number) {
		this._store = new WorkerStore(heartbeatTtlMs);
	}

	register(
		workerId: string,
		registration: Omit<WorkerRegistration, "lastHeartbeat" | "status">
	): void {
		this._store.register(workerId, registration);
	}

	unregister(workerId: string): void {
		this._store.unregister(workerId);
	}

	get(workerId: string): WorkerRegistration | undefined {
		return this._store.get(workerId);
	}

	heartbeat(workerId: string): void {
		this._store.heartbeat(workerId);
	}

	updateLoad(workerId: string, currentLoad: number): void {
		this._store.updateLoad(workerId, currentLoad);
	}

	setStatus(
		workerId: string,
		status: import("../contracts/worker-protocol.types").WorkerStatus
	): void {
		this._store.setStatus(workerId, status);
	}

	private _isWorkerSuitable(
		worker: WorkerRegistration,
		jobType: string
	): boolean {
		return (
			worker.status === "active" &&
			worker.capabilities.includes(
				jobType as import("../domain/primitives").Capability
			) &&
			worker.currentLoad < worker.maxConcurrency
		);
	}

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

	purgeStaleWorkers(): string[] {
		return this._store.purgeStaleWorkers();
	}

	count(): number {
		return this._store.size();
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
			(registration) => registration.status === "active"
		);
	}
}
