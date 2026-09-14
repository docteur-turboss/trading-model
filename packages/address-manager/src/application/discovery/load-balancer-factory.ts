import type { LoadBalancingStrategy } from "../../domain/discovery/load-balancing-strategy";
import { LoadBalancingStrategyType } from "../../domain/discovery/load-balancing-strategy";
import { LeastConnectionsStrategy } from "./strategies/least-connections-strategy";
import { createRandomStrategy } from "./strategies/random-strategy";
import { createRoundRobinStrategy } from "./strategies/round-robin-strategy";

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
