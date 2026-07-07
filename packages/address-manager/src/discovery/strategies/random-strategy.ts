import type { ServiceInstance } from "../../client/type";
import type { LoadBalancingStrategy } from "../load-balancing-strategy";

export class RandomStrategy implements LoadBalancingStrategy {
	select(instances: ServiceInstance[]): ServiceInstance {
		const idx = Math.floor(Math.random() * instances.length);
		return instances[idx];
	}
}
