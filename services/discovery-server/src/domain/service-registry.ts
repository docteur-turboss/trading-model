import type { InstanceId } from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import { ALL_SERVICE_NAMES } from "@trading-model/primitives/service-instance-name";
import type { ServiceInstance } from "../shared/types";
import type { InstanceTokenManager } from "./instance-token-manager";
import {
	NoopDiscoveryMetrics,
	type RegistryMetricsPort,
} from "./ports/discovery-metrics.port";
import type { InstanceStorePort } from "./ports/instance-store.port";

export interface ServiceRegistryDeps {
	instanceStore: InstanceStorePort;
	tokenManager: InstanceTokenManager;
	metrics?: RegistryMetricsPort;
}

export class ServiceRegistry {
	public readonly tokenManager: InstanceTokenManager;
	public readonly instanceStore: InstanceStorePort;
	private readonly _metrics: RegistryMetricsPort;

	constructor(deps: ServiceRegistryDeps) {
		this.tokenManager = deps.tokenManager;
		this.instanceStore = deps.instanceStore;
		this._metrics = deps.metrics ?? NoopDiscoveryMetrics;
	}

	async registerInstance(instance: ServiceInstance) {
		const { instanceId } = instance;
		const token = this.tokenManager.generateToken(instanceId);
		await this.instanceStore.registerInstance(instance);
		await this.tokenManager.setToken(instanceId, token);
		const stored = await this.instanceStore.getInstance({
			serviceName: instance.serviceName,
			instanceId,
		});
		await this.syncRegisteredInstanceMetrics();
		return { ...stored!, token };
	}

	async updateToken(instanceId: InstanceId): Promise<string> {
		const newToken = this.tokenManager.generateToken(instanceId);
		await this.tokenManager.setToken(instanceId, newToken);
		return newToken;
	}

	async removeInstance(identity: ServiceIdentity): Promise<boolean> {
		const result = await this.instanceStore.removeInstance(identity);
		await this.tokenManager.deleteToken(identity.instanceId);
		if (result) {
			await this.syncRegisteredInstanceMetrics();
		}
		return result;
	}

	/**
	 * Sets the instance gauges from the shared store. Every replica exports
	 * them, so each one must re-read the store (the lease cleanup cycle calls
	 * this): a replica that only counted its own registrations would keep a
	 * stale count and hide a drop from `max by (service)`. Known services
	 * without instances are set to 0 rather than left at their last value.
	 */
	async syncRegisteredInstanceMetrics(): Promise<void> {
		const counts = await Promise.all(
			[...ALL_SERVICE_NAMES].map(
				async (serviceName) =>
					[
						serviceName,
						(await this.instanceStore.getInstances(serviceName)).length,
					] as const
			)
		);
		let total = 0;
		for (const [serviceName, count] of counts) {
			this._metrics.setRegisteredInstancesPerService(serviceName, count);
			total += count;
		}
		this._metrics.setRegisteredInstances(total);
	}
}
