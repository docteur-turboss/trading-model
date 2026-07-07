import { logger } from "@trading-model/common/config/logger";
import { toServiceId } from "@trading-model/common/domain/primitives";
import { sleep } from "@trading-model/common/utils/sleep";

import type { ServiceInstance } from "../client/type";
import { recordDiscoveryMetrics } from "../metrics";
import type { CircuitBreaker } from "./circuit-breaker";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceDiscovery } from "./service-discovery";

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

export class DiscoveryRetryHandler {
	private static readonly _CIRCUIT_BREAKER_MAX_RETRIES = MAX_RETRIES;
	private static readonly _CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS =
		RETRY_BASE_DELAY_MS;

	constructor(
		private readonly _serviceDiscovery: ServiceDiscovery,
		private readonly _serviceCache: IServiceCache,
		readonly circuitBreaker: CircuitBreaker
	) {}

	async attemptDiscovery(
		serviceName: string,
		startTime: number
	): Promise<ServiceInstance> {
		let lastError: Error | null = null;

		for (
			let attempt = 0;
			attempt <= DiscoveryRetryHandler._CIRCUIT_BREAKER_MAX_RETRIES;
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
				if (attempt < DiscoveryRetryHandler._CIRCUIT_BREAKER_MAX_RETRIES) {
					const delay =
						DiscoveryRetryHandler._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS *
						2 ** attempt;
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

		await this._serviceCache.invalidate(toServiceId(serviceName));

		if (attempt < DiscoveryRetryHandler._CIRCUIT_BREAKER_MAX_RETRIES) {
			const delay =
				DiscoveryRetryHandler._CIRCUIT_BREAKER_RETRY_BASE_DELAY_MS *
				2 ** attempt;
			await sleep(delay);
		}

		return null;
	}

	async fallbackToStaleCache(
		serviceName: string,
		startTime: number
	): Promise<ServiceInstance | null> {
		try {
			const staleInstance = await this._serviceCache.get(
				toServiceId(serviceName)
			);
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
		} catch (err) {
			logger.debug("Cache lookup failed in fallback path", { error: err });
		}
		return null;
	}
}
