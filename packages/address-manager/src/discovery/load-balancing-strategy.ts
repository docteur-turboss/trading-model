import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import { LeastConnectionsStrategy } from "./strategies/least-connections-strategy";
import { createRandomStrategy } from "./strategies/random-strategy";
import { createRoundRobinStrategy } from "./strategies/round-robin-strategy";

export {
	createRandomStrategy,
	createRoundRobinStrategy,
	LeastConnectionsStrategy,
};

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

const LOAD_BALANCER_REGISTRY: Record<
	LoadBalancingStrategyType,
	LoadBalancingStrategy
> = {
	[LoadBalancingStrategyType.Random]: createRandomStrategy(),
	[LoadBalancingStrategyType.RoundRobin]: createRoundRobinStrategy(),
	[LoadBalancingStrategyType.LeastConnections]: new LeastConnectionsStrategy(),
};

export function createLoadBalancer(
	strategy: LoadBalancingStrategyType
): LoadBalancingStrategy {
	return LOAD_BALANCER_REGISTRY[strategy] ?? createRoundRobinStrategy();
}
