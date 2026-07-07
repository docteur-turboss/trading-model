import { recordDiscoveryMetrics } from "../metrics";
import type { DiscoveryCircuitBreaker } from "./circuit-breaker";
import { DiscoveryRetryHandler } from "./discovery-retry-handler";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceDiscovery } from "./service-discovery";
import type { ServiceHealthChecker } from "./service-health-checker";

export interface DiscoveryOrchestratorDeps {
	serviceDiscovery: ServiceDiscovery;
	serviceCache: IServiceCache;
	circuitBreaker: DiscoveryCircuitBreaker;
	healthChecker: ServiceHealthChecker;
}

export class DiscoveryOrchestrator {
	readonly circuitBreaker: DiscoveryCircuitBreaker;
	private readonly _serviceDiscovery: ServiceDiscovery;
	private readonly _healthChecker: ServiceHealthChecker;
	private readonly _retryHandler: DiscoveryRetryHandler;

	constructor(deps: DiscoveryOrchestratorDeps) {
		this._serviceDiscovery = deps.serviceDiscovery;
		this.circuitBreaker = deps.circuitBreaker;
		this._healthChecker = deps.healthChecker;
		this._retryHandler = new DiscoveryRetryHandler(
			deps.serviceDiscovery,
			deps.serviceCache,
			deps.circuitBreaker
		);
	}

	async findService(
		serviceName: string
	): Promise<import("../client/type").ServiceInstance> {
		const startTime = Date.now();
		try {
			return await this._retryHandler.attemptDiscovery(serviceName, startTime);
		} catch (lastError) {
			return this._handleDiscoveryFailure(serviceName, startTime, lastError);
		}
	}

	private async _handleDiscoveryFailure(serviceName: string, startTime: number, lastError: unknown): Promise<import("../client/type").ServiceInstance> {
		const staleInstance = await this._retryHandler.fallbackToStaleCache(serviceName, startTime);
		if (staleInstance) {
			return staleInstance;
		}
		recordDiscoveryMetrics({ serviceName, startTime }, "failure");
		throw lastError;
	}

	async findAllServices(
		serviceName: string
	): Promise<import("../client/type").ServiceInstance[]> {
		return this._serviceDiscovery.findAllServices(serviceName);
	}

	recordCallSuccess(instanceId: string, durationMs?: number): void {
		this._serviceDiscovery.releaseConnection(instanceId);
		this.circuitBreaker.recordSuccess(instanceId);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
			this._healthChecker.recordLatency(instanceId, durationMs, true);
		}
	}

	recordCallFailure(instanceId: string, durationMs?: number): void {
		this._serviceDiscovery.releaseConnection(instanceId);
		this.circuitBreaker.recordFailure(instanceId);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
			this._healthChecker.recordLatency(instanceId, durationMs, false);
		}
	}
}
