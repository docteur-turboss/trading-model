import type {
	WorkerRegistration,
	WorkerStatus,
} from "../contracts/worker-protocol.types";

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
			lastHeartbeat: new Date(),
			status: "active",
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
			worker.lastHeartbeat = new Date();
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
		const now = Date.now();
		const stale: string[] = [];
		for (const [id, worker] of this._workers) {
			if (now - worker.lastHeartbeat.getTime() > this._heartbeatTtlMs) {
				worker.status = "offline";
				stale.push(id);
			}
		}
		for (const id of stale) {
			this._workers.delete(id);
		}
		return stale;
	}

	all(): Map<string, WorkerRegistration> {
		return this._workers;
	}

	size(): number {
		return this._workers.size;
	}
}
