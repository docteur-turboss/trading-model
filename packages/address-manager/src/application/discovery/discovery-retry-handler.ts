import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { sleep } from "@trading-model/common/utils/sleep";
import { logger } from "@trading-model/http/infrastructure/logger";
import type { UnixTimestamp } from "@trading-model/primitives/primitives";
import { DurationMs, toServiceId } from "@trading-model/primitives/primitives";

import type { ServiceInstance } from "../../domain/client/type";
import type { DiscoveryContext } from "../../domain/discovery/discovery-context";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import {
	DiscoveryResult,
	recordDiscoveryMetrics,
} from "../../infrastructure/metrics";
import type { DiscoveryCircuitBreaker } from "./circuit-breaker";
import type { ServiceDiscovery } from "./service-discovery";

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

export class DiscoveryRetryHandler {
	constructor(
		private readonly _serviceDiscovery: ServiceDiscovery,
		private readonly _serviceCache: IServiceCache,
		readonly circuitBreaker: DiscoveryCircuitBreaker
	) {}

	async attemptDiscovery(ctx: DiscoveryContext): Promise<ServiceInstance> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				const instance = await this._serviceDiscovery.findService(
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
		await this._syncCircuitState(instance);

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

	/**
	 * Pulls the shared circuit state before `isOpen` is consulted, so an
	 * instance tripped by another replica is not handed out. A store outage
	 * degrades to the local state rather than blocking discovery.
	 */
	private async _syncCircuitState(instance: ServiceInstance): Promise<void> {
		try {
			await this.circuitBreaker.loadFromStore(instance.instanceId);
		} catch (err) {
			logger.warn("Circuit state store unavailable — using local state", {
				instanceId: instance.instanceId,
				error: this._captureError(err).message,
			});
		}
	}

	async fallbackToStaleCache(
		ctx: DiscoveryContext
	): Promise<ServiceInstance | null> {
		try {
			const staleInstance = await this._serviceCache.get(
				toServiceId(ctx.serviceName)
			);
			if (staleInstance) {
				return this._returnStaleInstance(staleInstance, ctx);
			}
		} catch (err) {
			logger.debug("Cache lookup failed in fallback path", { error: err });
		}
		return null;
	}

	private _returnStaleInstance(
		staleInstance: ServiceInstance,
		ctx: DiscoveryContext
	): ServiceInstance {
		logger.warn(
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
