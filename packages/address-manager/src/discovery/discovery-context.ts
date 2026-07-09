import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceInstance } from "../client/type";

export interface DiscoveryContext {
	serviceName: ServiceInstanceName;
	startTime: number;
}

export interface CircuitBreakerCheckParams {
	instance: ServiceInstance;
	serviceName: ServiceInstanceName;
	startTime: number;
	attempt: number;
}
