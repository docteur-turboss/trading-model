import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { sleep } from "@trading-model/common/utils/sleep";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { InstanceId } from "@trading-model/primitives/primitives";
import {
	DurationMs,
	toServiceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

import type { ServiceInstance } from "../../domain/client/type";
import type { DiscoveryContext } from "../../domain/discovery/discovery-context";
import type { ServiceCachePort } from "../../domain/ports/service-cache.port";
import {
	DiscoveryResult,
	recordDiscoveryMetrics,
} from "../../infrastructure/metrics";
import type { DiscoveryCircuitBreaker } from "./circuit-breaker";
import type { ServiceResolver } from "./service-resolver";

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

/** Finds a service address: cache first, then discovery behind the circuit breaker, retried and falling back to a stale entry. */
export class DiscoveryRetryHandler {
	constructor(
		private readonly _resolver: ServiceResolver,
		private readonly _serviceCache: ServiceCachePort,
		readonly circuitBreaker: DiscoveryCircuitBreaker
	) {}

	async findService(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance> {
		const ctx: DiscoveryContext = {
			serviceName,
			startTime: UnixTimestamp.now(),
		};
		try {
			return await this.attemptDiscovery(ctx);
		} catch (lastError) {
			const staleInstance = await this.fallbackToStaleCache(ctx);
			if (staleInstance) {
				return staleInstance;
			}
			recordDiscoveryMetrics(
				{ serviceName: toServiceId(ctx.serviceName), startTime: ctx.startTime },
				DiscoveryResult.Failure
			);
			throw lastError;
		}
	}

	recordCallSuccess(instanceId: InstanceId, durationMs?: number): void {
		this.circuitBreaker.recordSuccess(instanceId);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
		}
	}

	recordCallFailure(instanceId: InstanceId, durationMs?: number): void {
		this.circuitBreaker.recordFailure(instanceId);
		if (durationMs !== undefined) {
			this.circuitBreaker.recordLatency(instanceId, durationMs);
		}
	}

	async attemptDiscovery(ctx: DiscoveryContext): Promise<ServiceInstance> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				const instance = await this._resolver.findCachedService(
					ctx.serviceName
				);
				const result = await this._checkServiceCircuitBreaker({
					instance,
					serviceName: ctx.serviceName,
					startTime: ctx.startTime,
					attempt,
				});
				if (result) {
					return result;
				}
			} catch (err) {
				lastError = this._captureError(err);
				if (attempt < MAX_RETRIES) {
					await sleep(this._backoffDelay(attempt));
				}
			}
		}
		throw lastError ?? new Error("Discovery failed");
	}

	private _captureError(err: unknown): Error {
		return err instanceof Error ? err : new Error(String(err));
	}

	private _backoffDelay(attempt: number): number {
		return computeExponentialBackoff(attempt, {
			baseDelayMs: DurationMs.of(RETRY_BASE_DELAY_MS),
		});
	}

	private async _checkServiceCircuitBreaker(params: {
		instance: ServiceInstance;
		serviceName: ServiceInstanceName;
		startTime: UnixTimestamp;
		attempt: number;
	}): Promise<ServiceInstance | null> {
		const { instance, serviceName, startTime, attempt } = params;
		if (!this.circuitBreaker.isOpen(instance.instanceId)) {
			recordDiscoveryMetrics(
				{ serviceName: toServiceId(serviceName), startTime },
				DiscoveryResult.Success
			);
			return instance;
		}

		await this._serviceCache.delete(toServiceId(serviceName));
		if (attempt < MAX_RETRIES) {
			await sleep(this._backoffDelay(attempt));
		}
		return null;
	}

	async fallbackToStaleCache(
		ctx: DiscoveryContext
	): Promise<ServiceInstance | null> {
		try {
			const staleInstance = await this._serviceCache.getStale(
				toServiceId(ctx.serviceName)
			);
			if (staleInstance) {
				return this._returnStaleInstance(staleInstance, ctx);
			}
		} catch (err) {
			getLogger().debug("Cache lookup failed in fallback path", { error: err });
		}
		return null;
	}

	private _returnStaleInstance(
		staleInstance: ServiceInstance,
		ctx: DiscoveryContext
	): ServiceInstance {
		getLogger().warn(
			"Circuit breaker exhausted — returning stale cached instance as fallback",
			{
				serviceName: ctx.serviceName,
				instanceId: staleInstance.instanceId,
			}
		);
		recordDiscoveryMetrics(
			{ serviceName: toServiceId(ctx.serviceName), startTime: ctx.startTime },
			DiscoveryResult.Degraded
		);
		return staleInstance;
	}
}
