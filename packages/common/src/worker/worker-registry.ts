import type { WorkerRegistration } from "@trading-model/validation/contracts/worker-protocol.types";
import { WorkerHealthMonitor } from "./worker-health-monitor";
import { WorkerLoadBalancer } from "./worker-load-balancer";
import { WorkerStore } from "./worker-store";

export class WorkerRegistry {
	private readonly _store: WorkerStore;
	private readonly _loadBalancer: WorkerLoadBalancer;
	private readonly _healthMonitor: WorkerHealthMonitor;

	constructor(heartbeatTtlMs: number) {
		this._store = new WorkerStore(heartbeatTtlMs);
		this._loadBalancer = new WorkerLoadBalancer(this._store);
		this._healthMonitor = new WorkerHealthMonitor(this._store);
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

	findBestWorker(jobType: string): WorkerRegistration | null {
		return this._loadBalancer.findBestWorker(jobType);
	}

	purgeStaleWorkers(): string[] {
		return this._healthMonitor.purgeStaleWorkers();
	}

	count(): number {
		return this._store.size();
	}

	averageLoad(): number {
		return this._healthMonitor.averageLoad();
	}

	getAllActive(): WorkerRegistration[] {
		return this._healthMonitor.getAllActive();
	}
}
