import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import type { Application } from "express";
import { buildAddressManagerDependencies } from "./address-manager-factory";
import type { TokenManager } from "./client/token-manager";
import type { ServiceInstance } from "./client/type";
import type { AddressManagerConfig } from "./config/address-manager-config";
import type { DiscoveryOrchestrator } from "./discovery/discovery-orchestrator";
import type { LifecycleManager } from "./lifecycle-manager";
import type { MetricsCollector } from "./monitoring/metrics-collector";

export default class AddressManager {
	private readonly _tokenManager: TokenManager;
	private readonly _discoveryOrchestrator: DiscoveryOrchestrator;
	private readonly _metricsCollector: MetricsCollector;
	private readonly _lifecycleManager: LifecycleManager;

	constructor(config: AddressManagerConfig) {
		const deps = buildAddressManagerDependencies(config);
		this._tokenManager = deps.tokenManager;
		this._discoveryOrchestrator = deps.discoveryOrchestrator;
		this._metricsCollector = deps.metricsCollector;
		this._lifecycleManager = deps.lifecycleManager;
	}

	get circuitBreaker(): import("./discovery/circuit-breaker").DiscoveryCircuitBreaker {
		return this._discoveryOrchestrator.circuitBreaker;
	}

	getToken(): string {
		return this._tokenManager.getToken();
	}

	findService(serviceName: ServiceInstanceName): Promise<ServiceInstance> {
		return this._discoveryOrchestrator.findService(serviceName);
	}

	findAllServices(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance[]> {
		return this._discoveryOrchestrator.findAllServices(serviceName);
	}

	recordCallSuccess(instanceId: InstanceId, durationMs?: number): void {
		this._discoveryOrchestrator.recordCallSuccess(instanceId, durationMs);
	}

	recordCallFailure(instanceId: InstanceId, durationMs?: number): void {
		this._discoveryOrchestrator.recordCallFailure(instanceId, durationMs);
	}

	listenExpress(app: Application): void {
		this._metricsCollector.listenExpress(app);
	}

	getMetrics(): import("./monitoring/system-metrics").SystemMetricsPayload {
		return this._metricsCollector.getMetrics();
	}

	getServiceCallTracker(): import("./monitoring/service-call-tracker").ServiceCallTracker {
		return this._metricsCollector.getServiceCallTracker();
	}

	start(): { stop: () => void; ready: Promise<void> } {
		return this._lifecycleManager.start();
	}
}
