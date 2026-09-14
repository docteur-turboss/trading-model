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

export enum LoadBalancingStrategyType {
	Random = "random",
	RoundRobin = "round-robin",
	LeastConnections = "least-connections",
}
