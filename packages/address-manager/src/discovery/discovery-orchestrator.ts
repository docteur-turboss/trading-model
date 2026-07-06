import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";

import type { ServiceInstance } from "../client/type";
import { recordDiscoveryMetrics } from "../metrics";
import { CircuitBreaker } from "./circuit-breaker";
import type { IServiceCache } from "./service-cache.interface";
import { ServiceDiscovery } from "./service-discovery";
import { ServiceHealthChecker } from "./service-health-checker";

export interface DiscoveryOrchestratorDeps {
	serviceDiscovery: ServiceDiscovery;
	serviceCache: IServiceCache;
	circuitBreaker: CircuitBreaker;
	healthChecker: ServiceHealthChecker;
}

export class DiscoveryOrchestrator {
	private static readonly _CIRCUIT_BREAKER_MAX_RETRIES = 2;
	private static readonly _CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS = 100;

	readonly circuitBreaker: CircuitBreaker;
	private readonly _serviceDiscovery: ServiceDiscovery;
	private readonly _serviceCache: IServiceCache;
	private readonly _healthChecker: ServiceHealthChecker;

	constructor(deps: DiscoveryOrchestratorDeps) {
		this._serviceDiscovery = deps.serviceDiscovery;
		this._serviceCache = deps.serviceCache;
		this.circuitBreaker = deps.circuitBreaker;
		this._healthChecker = deps.healthChecker;
	}

	async findService(serviceName: string): Promise<ServiceInstance> {
		const startTime = Date.now();

		try {
			return await this._attemptDiscovery(serviceName, startTime);
		} catch (lastError) {
			const staleInstance = await this._fallbackToStaleCache(serviceName, startTime);
			if (staleInstance) {
				return staleInstance;
			}

			recordDiscoveryMetrics(serviceName, startTime, "failure");
			throw lastError;
		}
	}

	async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
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

	private async _attemptDiscovery(
		serviceName: string,
		startTime: number
	): Promise<ServiceInstance> {
		let lastError: Error | null = null;

		for (
			let attempt = 0;
			attempt <= DiscoveryOrchestrator._CIRCUIT_BREAKER_MAX_RETRIES;
			attempt++
		) {
			try {
				const instance = await this._serviceDiscovery.findService(serviceName);
				const result = await this._checkServiceCircuitBreaker({
					instance,
					serviceName,
					startTime,
					attempt,
				});
				if (result) {
					return result;
				}
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));
				if (attempt < DiscoveryOrchestrator._CIRCUIT_BREAKER_MAX_RETRIES) {
					const delay =
						DiscoveryOrchestrator._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * 2 ** attempt;
					await sleep(delay);
				}
			}
		}

		throw lastError ?? new Error("Discovery failed");
	}

	private async _checkServiceCircuitBreaker(params: {
		instance: ServiceInstance;
		serviceName: string;
		startTime: number;
		attempt: number;
	}): Promise<ServiceInstance | null> {
		const { instance, serviceName, startTime, attempt } = params;
		this.circuitBreaker.loadFromStore(instance.instanceId).catch(() => {});

		if (!this.circuitBreaker.isOpen(instance.instanceId)) {
			this._serviceDiscovery.acquireConnection(instance.instanceId);
			recordDiscoveryMetrics(serviceName, startTime, "success");
			return instance;
		}

		await this._serviceCache.invalidate(serviceName);

		if (attempt < DiscoveryOrchestrator._CIRCUIT_BREAKER_MAX_RETRIES) {
			const delay =
				DiscoveryOrchestrator._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS * 2 ** attempt;
			await sleep(delay);
		}

		return null;
	}

	private async _fallbackToStaleCache(
		serviceName: string,
		startTime: number
	): Promise<ServiceInstance | null> {
		try {
			const staleInstance = await this._serviceCache.get(serviceName);
			if (staleInstance) {
				logger.warn(
					"Circuit breaker exhausted — returning stale cached instance as fallback",
					{
						serviceName,
						instanceId: staleInstance.instanceId,
					}
				);
				recordDiscoveryMetrics(serviceName, startTime, "degraded");
				return staleInstance;
			}
		} catch {
			// ignore cache errors in fallback path
		}
		return null;
	}
}
