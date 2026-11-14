import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import { getLogger } from "@trading-model/contracts/logger-registry";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	DurationMs,
	type InstanceId,
	type ServiceId,
	toServiceId,
	UnixTimestamp,
} from "@trading-model/primitives/primitives";

import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { ServiceInstance } from "../../domain/client/type";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { DiscoveryContext } from "../../domain/discovery/discovery-context";
import type { ServiceCachePort } from "../../domain/ports/service-cache.port";
import {
	DiscoveryResult,
	recordDiscoveryMetrics,
} from "../../infrastructure/metrics";
import {
	serviceNotFoundError,
	serviceUnreachableError,
} from "../../shared/errors";
import type { DiscoveryCircuitBreaker } from "./circuit-breaker";
import { EndpointResolver } from "./endpoint-resolver";

const MAX_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 100;

/** Dependencies of DiscoveryRetryHandler. */
export interface DiscoveryRetryHandlerDeps {
	httpClient: HttpClient;
	serviceCache: ServiceCachePort;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

/** Finds a service address: cache first, then discovery behind the circuit breaker, retried and falling back to a stale entry. */
export class DiscoveryRetryHandler {
	/** Same selection logic as the gateway (ADR-0045). */
	private readonly _endpoints: EndpointResolver;
	private readonly _serviceCache: ServiceCachePort;
	private readonly _healthChecker: ServiceHealthChecker;

	constructor(
		deps: DiscoveryRetryHandlerDeps,
		readonly circuitBreaker: DiscoveryCircuitBreaker
	) {
		this._serviceCache = deps.serviceCache;
		this._healthChecker = deps.healthChecker;
		this._endpoints = new EndpointResolver(
			deps.config.addressManagerUrl,
			Number(deps.config.cacheTtlMs),
			deps.httpClient,
			deps.config.discoveryTimeoutMs
		);
	}

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
				const instance = await this.findCachedService(ctx.serviceName);
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

	/** Healthy cached instance if any (an unhealthy one is evicted), else a fresh lookup. */
	async findCachedService(
		serviceName: ServiceInstanceName
	): Promise<ServiceInstance> {
		const cached = await this._serviceCache.get(toServiceId(serviceName));
		if (cached) {
			if (await this._healthChecker.isHealthy(cached)) {
				return cached;
			}
			await this._serviceCache.delete(toServiceId(serviceName));
		}
		return this.lookup(toServiceId(serviceName));
	}

	/** `majorVersion` omitted: any live instance (services pass none, the gateway the route's). */
	async lookup(
		serviceName: ServiceId,
		majorVersion?: number
	): Promise<ServiceInstance> {
		const found = await this._findInstance(serviceName, majorVersion);
		const instance = this._addressed(found);
		await this._validateAndCache(instance, serviceName);
		return instance;
	}

	/**
	 * Targets the instance through the address its health check uses (its DNS
	 * name by default). The registered IP is the first interface the instance
	 * saw, which on a multi-network host may be unreachable from the caller.
	 */
	private _addressed(instance: ServiceInstance): ServiceInstance {
		return {
			...instance,
			host: this._healthChecker.locate(instance) as ServiceInstance["host"],
		};
	}

	private async _findInstance(
		serviceName: ServiceId,
		majorVersion?: number
	): Promise<ServiceInstance> {
		let instance: ServiceInstance | undefined;
		try {
			instance = (await this._endpoints.findInstance(
				serviceName,
				majorVersion
			)) as ServiceInstance | undefined;
		} catch (error) {
			throw serviceNotFoundError(`Service "${serviceName}" not found`, {
				cause: normalizeError(error),
			});
		}
		// discovery-server never registers: findInstance answers a host-less stub for it.
		if (!instance?.port) {
			throw serviceNotFoundError(
				`Service "${serviceName}" has no registered instances`
			);
		}
		return instance;
	}

	private async _validateAndCache(
		instance: ServiceInstance,
		serviceName: ServiceId
	): Promise<void> {
		const isHealthy = await this._healthChecker.isHealthy(instance);
		if (!isHealthy) {
			await this._serviceCache.delete(toServiceId(serviceName));
			throw serviceUnreachableError(`Service "${serviceName}" is unreachable`);
		}
		await this._serviceCache.set({
			serviceName: toServiceId(serviceName),
			instance,
		});
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
