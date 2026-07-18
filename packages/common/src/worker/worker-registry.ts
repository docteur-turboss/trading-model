import { WorkerHealthMonitor } from "./worker-health-monitor";
import { WorkerLoadBalancer } from "./worker-load-balancer";
import { WorkerStore } from "./worker-store";

export interface WorkerRegistryDeps {
	store: WorkerStore;
	loadBalancer: WorkerLoadBalancer;
	healthMonitor: WorkerHealthMonitor;
}

export type WorkerRegistry = {
	store: WorkerStore;
	loadBalancer: WorkerLoadBalancer;
	healthMonitor: WorkerHealthMonitor;
};

export function createWorkerRegistry(heartbeatTtlMs: number): WorkerRegistry;
export function createWorkerRegistry(deps: WorkerRegistryDeps): WorkerRegistry;
export function createWorkerRegistry(
	param: number | WorkerRegistryDeps
): WorkerRegistry {
	if (typeof param === "number") {
		const store = new WorkerStore(param);
		return {
			store,
			loadBalancer: new WorkerLoadBalancer(store),
			healthMonitor: new WorkerHealthMonitor(store),
		};
	}
	return param;
}
