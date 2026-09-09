import type { ServiceInstance } from "../../../domain/client/type";
import type { LoadBalancingStrategy } from "../../../domain/discovery/load-balancing-strategy";

export function createRandomStrategy(): LoadBalancingStrategy {
	return {
		select(instances: ServiceInstance[]): ServiceInstance {
			const idx = Math.floor(Math.random() * instances.length);
			return instances[idx];
		},
	};
}
