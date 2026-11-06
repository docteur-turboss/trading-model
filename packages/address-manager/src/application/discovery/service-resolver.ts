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
import { ServiceInstancesWire } from "@trading-model/validation/wire/service-instance";
import type { ServiceHealthChecker } from "../../adapters/outbound/discovery/service-health-checker";
import type { ServiceInstance } from "../../domain/client/type";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";
import type { IServiceCache } from "../../domain/discovery/service-cache.interface";

export interface ServiceResolverDeps {
	httpClient: HttpClient;
	serviceCache: IServiceCache;
	config: AddressManagerConfig;
	healthChecker: ServiceHealthChecker;
}

export class ServiceResolver {
	constructor(private readonly _deps: ServiceResolverDeps) {}

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

	async findService(serviceName: ServiceId): Promise<ServiceInstance> {
		const instances = await this._fetchInstances(serviceName).catch(
			(error: unknown) => {
				throw serviceNotFoundError(`Service "${serviceName}" not found`, {
					cause: normalizeError(error),
				});
			}
		);
		const instance = this._addressed(
			this._firstInstance(instances, serviceName)
		);
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

	/** Instances of a service, validated: `[]` when discovery answers 204. */
	private async _fetchInstances(
		serviceName: ServiceId
	): Promise<ServiceInstance[]> {
		const instances = await this._httpClient.get(
			URLString.of(`${this._config.addressManagerUrl}/services/${serviceName}`),
			{ timeoutMs: this._discoveryTimeoutMs },
			ServiceInstancesWire
		);
		return instances ?? [];
	}

	private _firstInstance(
		instances: ServiceInstance[],
		serviceName: ServiceId
	): ServiceInstance {
		const instance = instances[0];
		if (!instance) {
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
			return await this._fetchInstances(serviceName);
		} catch (error) {
			throw serviceUnreachableError(
				`Unable to list instances of "${serviceName}"`,
				{ cause: normalizeError(error) }
			);
		}
	}
}
