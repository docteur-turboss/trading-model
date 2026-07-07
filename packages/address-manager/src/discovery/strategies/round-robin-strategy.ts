import type { ServiceInstance } from "../../client/type";
import type { LoadBalancingStrategy } from "../load-balancing-strategy";

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
