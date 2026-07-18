import { buildAddressManagerDependencies } from "./address-manager-factory";
import type { TokenManager } from "./client/token-manager";
import type { AddressManagerConfig } from "./config/address-manager-config";
import type { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import type { LifecycleManager } from "./lifecycle-manager";
import type { MetricsCollector } from "./monitoring/metrics-collector";

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
}
