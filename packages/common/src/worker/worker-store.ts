import type {
	WorkerRegistration,
	WorkerStatus,
} from "../contracts/worker-protocol-types";
import { UnixTimestamp, WorkerStatusCode } from "../domain/primitives";

function _findStaleWorkers(
	workers: Map<string, WorkerRegistration>,
	heartbeatTtlMs: number
): string[] {
	const now = UnixTimestamp.now();
	const stale: string[] = [];
	for (const [id, worker] of workers) {
		if (now - worker.lastHeartbeat > heartbeatTtlMs) {
			worker.status = WorkerStatusCode.Offline;
			stale.push(id);
		}
	}
	return stale;
}

function _removeWorkers(
	workers: Map<string, WorkerRegistration>,
	ids: string[]
): void {
	for (const id of ids) {
		workers.delete(id);
	}
}

export class WorkerStore {
	private readonly _workers: Map<string, WorkerRegistration> = new Map();
	private readonly _heartbeatTtlMs: number;

	constructor(heartbeatTtlMs: number) {
		this._heartbeatTtlMs = heartbeatTtlMs;
	}

	register(
		workerId: string,
		registration: Omit<WorkerRegistration, "lastHeartbeat" | "status">
	): void {
		this._workers.set(workerId, {
			...registration,
			lastHeartbeat: UnixTimestamp.now(),
			status: WorkerStatusCode.Active,
		});
	}

	unregister(workerId: string): void {
		this._workers.delete(workerId);
	}

	get(workerId: string): WorkerRegistration | undefined {
		return this._workers.get(workerId);
	}

	heartbeat(workerId: string): void {
		const worker = this._workers.get(workerId);
		if (worker) {
			worker.lastHeartbeat = UnixTimestamp.now();
		}
	}

	updateLoad(workerId: string, currentLoad: number): void {
		const worker = this._workers.get(workerId);
		if (worker) {
			worker.currentLoad = currentLoad;
		}
	}

	setStatus(workerId: string, status: WorkerStatus): void {
		const worker = this._workers.get(workerId);
		if (worker) {
			worker.status = status;
		}
	}

	purgeStaleWorkers(): string[] {
		const stale = _findStaleWorkers(this._workers, this._heartbeatTtlMs);
		_removeWorkers(this._workers, stale);
		return stale;
	}

	all(): Map<string, WorkerRegistration> {
		return new Map(this._workers);
	}

	values(): IterableIterator<WorkerRegistration> {
		return this._workers.values();
	}

	size(): number {
		return this._workers.size;
	}
}
