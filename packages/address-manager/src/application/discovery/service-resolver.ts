import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	type ServiceId,
	toServiceId,
} from "@trading-model/primitives/primitives";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { ServiceInstance } from "../../domain/client/type";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { ServiceCachePort } from "../../domain/ports/service-cache.port";
import {
	serviceNotFoundError,
	serviceUnreachableError,
} from "../../shared/errors";
import { EndpointResolver } from "./endpoint-resolver";

/** Dependencies of ServiceResolver. */
export interface ServiceResolverDeps {
	httpClient: HttpClient;
	serviceCache: ServiceCachePort;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

/** Resolves a service name to a target address. */
export class ServiceResolver {
	/** Same selection logic as the gateway (ADR-0045). */
	private readonly _endpoints: EndpointResolver;

	constructor(private readonly _deps: ServiceResolverDeps) {
		this._endpoints = new EndpointResolver(
			_deps.config.addressManagerUrl,
			Number(_deps.config.cacheTtlMs),
			_deps.httpClient,
			_deps.config.discoveryTimeoutMs
		);
	}

	private get _serviceCache(): ServiceCachePort {
		return this._deps.serviceCache;
	}
	private get _healthChecker(): ServiceHealthChecker {
		return this._deps.healthChecker;
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
		return this.findService(toServiceId(serviceName));
	}

	/** `majorVersion` omitted: any live instance (services pass none, the gateway the route's). */
	async findService(
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
}
