import type { ServiceInstance } from "../client/type";
import { LeastConnectionsStrategy } from "./strategies/least-connections-strategy";
import { RandomStrategy } from "./strategies/random-strategy";
import { RoundRobinStrategy } from "./strategies/round-robin-strategy";

export { LeastConnectionsStrategy, RandomStrategy, RoundRobinStrategy };

export interface LoadBalancingStrategy {
	select(instances: ServiceInstance[]): ServiceInstance;
}

export interface ConnectionCountingStrategy extends LoadBalancingStrategy {
	acquire(instanceId: string): void;
	release(instanceId: string): void;
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
	[LoadBalancingStrategyType.Random]: new RandomStrategy(),
	[LoadBalancingStrategyType.RoundRobin]: new RoundRobinStrategy(),
	[LoadBalancingStrategyType.LeastConnections]: new LeastConnectionsStrategy(),
};

export function createLoadBalancer(
	strategy: LoadBalancingStrategyType
): LoadBalancingStrategy {
	return LOAD_BALANCER_REGISTRY[strategy] ?? new RoundRobinStrategy();
}
