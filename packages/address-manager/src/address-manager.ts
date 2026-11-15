import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/primitives/primitives";
import type { TokenManager } from "./client/token-manager";
import type { ServiceInstance } from "./client/type";
import type { AddressManagerConfig } from "./config/address-manager-config";
import { buildAddressManagerDependencies } from "./config/container";
import type { DiscoveryRetryHandler } from "./discovery/discovery-retry-handler";
import type { LifecycleManager } from "./lifecycle-manager";
import type { MetricsCollector } from "./monitoring/metrics-collector";

/** Address manager facade: token, service discovery and lifecycle of the service. */
export default class AddressManager {
	public readonly tokenManager: TokenManager;
	public readonly discovery: DiscoveryRetryHandler;
	public readonly metricsCollector: MetricsCollector;
	public readonly lifecycleManager: LifecycleManager;

	constructor(config: AddressManagerConfig) {
		const deps = buildAddressManagerDependencies(config);
		this.tokenManager = deps.tokenManager;
		this.discovery = deps.discovery;
		this.metricsCollector = deps.metricsCollector;
		this.lifecycleManager = deps.lifecycleManager;
	}

	/** Report a successful call to `instanceId` (from `findService`) to its circuit breaker. */
	recordCallSuccess(instanceId: InstanceId, durationMs?: number): void {
		this.discovery.recordCallSuccess(instanceId, durationMs);
	}

	/** Report a failed call to `instanceId` (from `findService`) to its circuit breaker. */
	recordCallFailure(instanceId: InstanceId, durationMs?: number): void {
		this.discovery.recordCallFailure(instanceId, durationMs);
	}

	findService(serviceName: ServiceInstanceName): Promise<ServiceInstance> {
		return this.discovery.findService(serviceName);
	}
}
