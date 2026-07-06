import { toServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceInstance } from "../client/type";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { IServiceCache } from "./service-cache.interface";
import type { ServiceHealthChecker } from "./service-health-checker";
import type { ServiceResolver } from "./service-resolver";

export class ServiceFinder {
	constructor(
		private readonly _serviceCache: IServiceCache,
		private readonly _healthChecker: ServiceHealthChecker,
		private readonly _resolver: ServiceResolver,
		private readonly _config: AddressManagerConfig
	) {}

	private async _getHealthyCachedInstance(
		serviceName: string
	): Promise<ServiceInstance | null> {
		const cachedInstance = await this._serviceCache.get(
			toServiceId(serviceName)
		);
		if (!cachedInstance) {
			return null;
		}
		const isHealthy = await this._healthChecker.isHealthy(cachedInstance);
		if (isHealthy) {
			return cachedInstance;
		}
		await this._serviceCache.invalidate(toServiceId(serviceName));
		return null;
	}

	async findService(serviceName: string): Promise<ServiceInstance> {
		if (this._config.identity.region) {
			return this.findServiceInRegion(
				serviceName,
				this._config.identity.region
			);
		}

		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}

		return this._resolver.resolveAndValidateService(serviceName);
	}

	async findServiceInRegion(
		serviceName: string,
		region: string
	): Promise<ServiceInstance> {
		const cached = await this._getHealthyCachedInstance(serviceName);
		if (cached) {
			return cached;
		}

		return this._resolver.resolveAndValidateServiceInRegion(
			serviceName,
			region
		);
	}

	async findAllServices(serviceName: string): Promise<ServiceInstance[]> {
		return this._resolver.findAllServices(serviceName);
	}
}
