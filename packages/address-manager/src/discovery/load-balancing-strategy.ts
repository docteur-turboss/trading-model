import type { ServiceInstance } from "../client/type";

export interface LoadBalancingStrategy {
	select(instances: ServiceInstance[]): ServiceInstance;
}

export interface ConnectionCountingStrategy extends LoadBalancingStrategy {
	acquire(instanceId: string): void;
	release(instanceId: string): void;
	dispose(): void;
}

export class RandomStrategy implements LoadBalancingStrategy {
	select(instances: ServiceInstance[]): ServiceInstance {
		const idx = Math.floor(Math.random() * instances.length);
		return instances[idx];
	}
}

export class RoundRobinStrategy implements LoadBalancingStrategy {
	private _index = 0;

	select(instances: ServiceInstance[]): ServiceInstance {
		const idx = this._index % instances.length;
		this._index = (idx + 1) % instances.length;
		return instances[idx];
	}

	reset(): void {
		this._index = 0;
	}
}

/**
 * Least-connections strategy.
 *
 * NOTE: The connection count is process-local only. In a horizontally-scaled
 * deployment (multiple replicas of the same service), each replica has its
 * own independent counter. This strategy does NOT provide global connection
 * distribution across the fleet.
 *
 * For global load distribution, use a dedicated load balancer (e.g. Nginx)
 * or accept that round-robin / random give adequate distribution in practice
 * for most high-throughput scenarios.
 */
export class LeastConnectionsStrategy implements ConnectionCountingStrategy {
	private readonly _connections = new Map<string, number>();
	private _sweepHandle?: NodeJS.Timeout;

	constructor() {
		this._sweepHandle = setInterval(() => this._sweepStaleEntries(), 60_000);
		this._sweepHandle.unref();
	}

	dispose(): void {
		if (this._sweepHandle) {
			clearInterval(this._sweepHandle);
			this._sweepHandle = undefined;
		}
	}

	private _sweepStaleEntries(): void {
		for (const [id, count] of this._connections) {
			if (count <= 0) {
				this._connections.delete(id);
			}
		}
	}

	select(instances: ServiceInstance[]): ServiceInstance {
		let min = Number.POSITIVE_INFINITY;
		let selected = instances[0];

		for (const inst of instances) {
			const count = this._connections.get(inst.instanceId) ?? 0;
			if (count < min) {
				min = count;
				selected = inst;
			}
		}

		return selected;
	}

	acquire(instanceId: string): void {
		this._connections.set(
			instanceId,
			(this._connections.get(instanceId) ?? 0) + 1
		);
	}

	release(instanceId: string): void {
		const current = this._connections.get(instanceId) ?? 0;
		if (current <= 1) {
			this._connections.delete(instanceId);
		} else {
			this._connections.set(instanceId, current - 1);
		}
	}
}

export type LoadBalancingStrategyType = "random" | "round-robin" | "least-connections";

const LOAD_BALANCER_REGISTRY: Record<LoadBalancingStrategyType, LoadBalancingStrategy> = {
	random: new RandomStrategy(),
	"round-robin": new RoundRobinStrategy(),
	"least-connections": new LeastConnectionsStrategy(),
};

export function createLoadBalancer(strategy: LoadBalancingStrategyType): LoadBalancingStrategy {
	return LOAD_BALANCER_REGISTRY[strategy] ?? new RoundRobinStrategy();
}
