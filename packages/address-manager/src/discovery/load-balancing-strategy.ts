import { TimerHandle } from "@trading-model/common/utils/timer-handle";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";

export interface LoadBalancingStrategy {
	select(instances: ServiceInstance[]): ServiceInstance;
}

export interface ConnectionCountingStrategy extends LoadBalancingStrategy {
	acquire(instanceId: InstanceId): void;
	release(instanceId: InstanceId): void;
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
	private readonly _connections = new Map<InstanceId, number>();
	private readonly _sweepHandle = new TimerHandle();

	constructor() {
		this._sweepHandle.startInterval(() => this._sweepStaleEntries(), 60_000);
		this._sweepHandle.unref();
	}

	dispose(): void {
		this._sweepHandle.stop();
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

	acquire(instanceId: InstanceId): void {
		this._connections.set(
			instanceId,
			(this._connections.get(instanceId) ?? 0) + 1
		);
	}

	release(instanceId: InstanceId): void {
		const current = this._connections.get(instanceId) ?? 0;
		if (current <= 1) {
			this._connections.delete(instanceId);
		} else {
			this._connections.set(instanceId, current - 1);
		}
	}
}

export enum LoadBalancingStrategyType {
	Random = "random",
	RoundRobin = "round-robin",
	LeastConnections = "least-connections",
}

const LOAD_BALANCER_REGISTRY: Record<
	LoadBalancingStrategyType,
	LoadBalancingStrategy
> = {
	[LoadBalancingStrategyType.Random]: new RandomStrategy(),
	[LoadBalancingStrategyType.RoundRobin]: new RoundRobinStrategy(),
	[LoadBalancingStrategyType.LeastConnections]: new LeastConnectionsStrategy(),
};

export function createLoadBalancer(
	strategy: LoadBalancingStrategyType
): LoadBalancingStrategy {
	return LOAD_BALANCER_REGISTRY[strategy] ?? new RoundRobinStrategy();
}
