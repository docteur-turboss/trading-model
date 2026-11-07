import {
	normalizeError,
	serviceNotFoundError,
	serviceUnreachableError,
} from "@trading-model/common/utils/errors";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import {
	type DurationMs,
	type ServiceId,
	toServiceId,
	URLString,
} from "@trading-model/primitives/primitives";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { ServiceInstance } from "../../domain/client/type";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";
import { EndpointResolver } from "./endpoint-resolver";

export interface ServiceResolverDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

export class ServiceResolver {
	/** Same selection logic as the gateway (ADR-0044). */
	private readonly _endpoints: EndpointResolver;

	constructor(private readonly _deps: ServiceResolverDeps) {
		this._endpoints = new EndpointResolver(
			_deps.config.addressManagerUrl,
			Number(_deps.config.cacheTtlMs),
			_deps.httpClient,
			_deps.config.discoveryTimeoutMs
		);
	}

	private get _httpClient(): HttpClient {
		return this._deps.httpClient;
	}
	private get _config(): AddressManagerConfig {
		return this._deps.config;
	}
	private get _serviceCache(): IServiceCache {
		return this._deps.serviceCache;
	}
	private get _healthChecker(): ServiceHealthChecker {
		return this._deps.healthChecker;
	}
	private get _discoveryTimeoutMs(): DurationMs {
		return this._deps.config.discoveryTimeoutMs;
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

	async findAllServices(serviceName: ServiceId): Promise<ServiceInstance[]> {
		try {
			const instances = await this._httpClient.get<ServiceInstance[]>(
				URLString.of(
					`${this._config.addressManagerUrl}/services/${serviceName}`
				),
				{ timeoutMs: this._discoveryTimeoutMs }
			);
			return instances ?? [];
		} catch (error) {
			throw serviceUnreachableError(
				`Unable to list instances of "${serviceName}"`,
				{ cause: normalizeError(error) }
			);
		}
	}
}
