import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ServiceInstance } from "../domain/client/type";
import type { AddressManagerConfig } from "../domain/config/address-manager-config";
import type { MetricsCollector } from "../infrastructure/monitoring/metrics-collector";
import { buildAddressManagerDependencies } from "./address-manager-factory";
import type { TokenManager } from "./client/token-manager";
import type { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import type { LifecycleManager } from "./lifecycle-manager";

export default class AddressManager {
	public readonly tokenManager: TokenManager;
	public readonly discoveryOrchestrator: DiscoveryOrchestrator;
	public readonly metricsCollector: MetricsCollector;
	public readonly lifecycleManager: LifecycleManager;

	constructor(config: AddressManagerConfig) {
		const deps = buildAddressManagerDependencies(config);
		this.tokenManager = deps.tokenManager;
		this.discoveryOrchestrator = deps.discoveryOrchestrator;
		this.metricsCollector = deps.metricsCollector;
		this.lifecycleManager = deps.lifecycleManager;
	}

	findService(serviceName: ServiceInstanceName): Promise<ServiceInstance> {
		return this.discoveryOrchestrator.findService(serviceName);
	}
}
