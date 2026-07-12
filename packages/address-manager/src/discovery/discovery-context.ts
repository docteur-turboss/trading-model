import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { UnixTimestamp } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";

export interface DiscoveryContext {
	serviceName: ServiceInstanceName;
	startTime: UnixTimestamp;
}

export interface CircuitBreakerCheckParams {
	instance: ServiceInstance;
	serviceName: ServiceInstanceName;
	startTime: UnixTimestamp;
	attempt: number;
}
