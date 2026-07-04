import type { WorkerRegistration, WorkerStatus } from "../types/worker.types";

export class WorkerRegistry {
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

	findBestWorker(jobType: string): WorkerRegistration | null {
		let best: WorkerRegistration | null = null;
		let bestLoad = Number.POSITIVE_INFINITY;

		for (const worker of this._workers.values()) {
			if (worker.status !== "active") {
				continue;
			}
			if (!worker.capabilities.includes(jobType)) {
				continue;
			}
			if (worker.currentLoad >= worker.maxConcurrency) {
				continue;
			}
			if (worker.currentLoad < bestLoad) {
				best = worker;
				bestLoad = worker.currentLoad;
			}
		}
		return best;
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

	count(): number {
		return this._workers.size;
	}

	averageLoad(): number {
		if (this._workers.size === 0) {
			return 0;
		}
		let total = 0;
		for (const worker of this._workers.values()) {
			if (worker.maxConcurrency > 0) {
				total += worker.currentLoad / worker.maxConcurrency;
			}
		}
		return total / this._workers.size;
	}

	getAllActive(): WorkerRegistration[] {
		return Array.from(this._workers.values()).filter(
			(registration) => registration.status === "active"
		);
	}
}
