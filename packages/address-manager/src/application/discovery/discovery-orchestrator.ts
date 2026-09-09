import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import {
	toServiceId,
	UnixTimestamp,
} from "@trading-model/common/domain/primitives";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { DiscoveryContext } from "../../domain/discovery/discovery-context";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import {
	DiscoveryResult,
	recordDiscoveryMetrics,
} from "../../infrastructure/metrics";
import type { DiscoveryCircuitBreaker } from "./circuit-breaker";
import { DiscoveryRetryHandler } from "./discovery-retry-handler";
import type { ServiceDiscovery } from "./service-discovery";

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
		serviceName: ServiceInstanceName
	): Promise<import("../../domain/client/type").ServiceInstance> {
		const ctx: DiscoveryContext = {
			serviceName,
			startTime: UnixTimestamp.now(),
		};
		try {
			return await this._retryHandler.attemptDiscovery(ctx);
		} catch (lastError) {
			return this._handleDiscoveryFailure(ctx, lastError);
		}
	}

	private async _handleDiscoveryFailure(
		ctx: DiscoveryContext,
		lastError: unknown
	): Promise<import("../../domain/client/type").ServiceInstance> {
		const staleInstance = await this._retryHandler.fallbackToStaleCache(ctx);
		if (staleInstance) {
			return staleInstance;
		}
		recordDiscoveryMetrics(
			{ serviceName: toServiceId(ctx.serviceName), startTime: ctx.startTime },
			DiscoveryResult.Failure
		);
		throw lastError;
	}

	findAllServices(
		serviceName: ServiceInstanceName
	): Promise<import("../../domain/client/type").ServiceInstance[]> {
		return this._serviceDiscovery.findAllServices(serviceName);
	}

	recordCallSuccess(instanceId: InstanceId, durationMs?: number): void {
		this._serviceDiscovery.releaseConnection(instanceId);
		this.circuitBreaker.recordSuccess(instanceId);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
			this._healthChecker.recordLatency(instanceId, durationMs, true);
		}
	}

	recordCallFailure(instanceId: InstanceId, durationMs?: number): void {
		this._serviceDiscovery.releaseConnection(instanceId);
		this.circuitBreaker.recordFailure(instanceId);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
			this._healthChecker.recordLatency(instanceId, durationMs, false);
		}
	}
}
