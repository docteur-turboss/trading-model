import type { ServiceInstance } from "../../../domain/client/type";
import type { LoadBalancingStrategy } from "../../../domain/discovery/load-balancing-strategy";

export function createRoundRobinStrategy(): LoadBalancingStrategy {
	let index = 0;
	return {
		select(instances: ServiceInstance[]): ServiceInstance {
			const idx = index % instances.length;
			index = (idx + 1) % instances.length;
			return instances[idx];
		},
	};
}
