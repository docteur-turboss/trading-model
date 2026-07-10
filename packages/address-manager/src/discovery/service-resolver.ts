import type { HttpClient } from "@trading-model/common/config/http-client";
import { type ServiceId, toServiceId } from "@trading-model/common/domain/primitives";
import {
	normalizeError,
	serviceNotFoundError,
	serviceUnreachableError,
} from "@trading-model/common/utils/errors";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";

export class ServiceResolver {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: AddressManagerConfig,
		private readonly _serviceCache: IServiceCache,
		private readonly _healthChecker: ServiceHealthChecker,
		private readonly _discoveryTimeoutMs: number
	) {}

	async resolveAndValidateService(
		serviceName: ServiceId
	): Promise<ServiceInstance> {
		const instances = await this._fetchService(serviceName);
		const instance = this._extractFirstInstance(instances, serviceName);
		await this._validateAndCache(instance, serviceName);
		return instance;
	}

	async resolveAndValidateServiceInRegion(
		serviceName: ServiceId,
		region: string
	): Promise<ServiceInstance> {
		let instances: unknown;
		try {
			instances = await this._httpClient.get<unknown>(
				`${this._config.addressManagerUrl}/services/${serviceName}/region/${region}`,
				{ timeoutMs: this._discoveryTimeoutMs }
			);
		} catch {
			return this.resolveAndValidateService(serviceName);
		}
		const found = await this._findHealthyInstance(instances, serviceName);
		if (found) {
			return found;
		}
		return this.resolveAndValidateService(serviceName);
	}

	private async _fetchService(serviceName: ServiceId): Promise<unknown> {
		try {
			return await this._httpClient.get<unknown>(
				`${this._config.addressManagerUrl}/services/${serviceName}`,
				{ timeoutMs: this._discoveryTimeoutMs }
			);
		} catch (error) {
			throw serviceNotFoundError(`Service "${serviceName}" not found`, {
				cause: normalizeError(error),
			});
		}
	}

	private _extractFirstInstance(
		instances: unknown,
		serviceName: ServiceId
	): ServiceInstance {
		const instance = Array.isArray(instances)
			? (instances as ServiceInstance[])[0]
			: (instances as ServiceInstance);
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
			await this._serviceCache.invalidate(toServiceId(serviceName));
			throw serviceUnreachableError(`Service "${serviceName}" is unreachable`);
		}
		await this._serviceCache.set({
			serviceName: toServiceId(serviceName),
			instance,
		});
	}

	private async _findHealthyInstance(
		instances: unknown,
		serviceName: ServiceId
	): Promise<ServiceInstance | null> {
		const list = Array.isArray(instances)
			? (instances as ServiceInstance[])
			: [instances as ServiceInstance];
		for (const instance of list) {
			if (instance) {
				const isHealthy = await this._healthChecker.isHealthy(instance);
				if (isHealthy) {
					await this._serviceCache.set({
						serviceName: toServiceId(serviceName),
						instance,
					});
					return instance;
				}
			}
		}
		return null;
	}

	async findAllServices(serviceName: ServiceId): Promise<ServiceInstance[]> {
		try {
			const instances = await this._httpClient.get<ServiceInstance[]>(
				`${this._config.addressManagerUrl}/services/${serviceName}`,
				{ timeoutMs: this._discoveryTimeoutMs }
			);
			return instances ?? [];
		} catch {
			return [];
		}
	}
}
