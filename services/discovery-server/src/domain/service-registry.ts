import type {
	AuthToken,
	InstanceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
import {
	ALL_SERVICE_NAMES,
	LEGACY_SERVICE_INSTANCE_NAMES,
} from "@trading-model/primitives/service-instance-name";
import type { ServiceInstance } from "../shared/types";
import type { InstanceTokenManager } from "./instance-token-manager";
import {
	NoopDiscoveryMetrics,
	type RegistryMetricsPort,
} from "./ports/discovery-metrics.port";
import type { IInstanceStore } from "./ports/instance-store.interface";

export interface ServiceRegistryDeps {
	instanceStore: IInstanceStore;
	tokenManager: InstanceTokenManager;
	metrics?: RegistryMetricsPort;
}

export class ServiceRegistry {
	public readonly tokenManager: InstanceTokenManager;
	public readonly instanceStore: IInstanceStore;
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
		await this.tokenManager.setToken(instanceId, token as unknown as AuthToken);
		const stored = await this.instanceStore.getInstance({
			serviceName: instance.serviceName,
			instanceId,
		});
		await this.syncRegisteredInstanceMetrics();
		return { ...stored!, token };
	}

	async updateToken(instanceId: InstanceId): Promise<string> {
		const newToken = this.tokenManager.generateToken(instanceId);
		await this.tokenManager.setToken(
			instanceId,
			newToken as unknown as AuthToken
		);
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
		let total = 0;
		for (const serviceName of ALL_SERVICE_NAMES) {
			const instances = await this.instanceStore.getInstances(serviceName);
			// A legacy name with no instance is not exported: a 0 series would trip
			// InstanceCountLow (it was >= 2 before the rename) on every upgrade.
			if (
				instances.length === 0 &&
				LEGACY_SERVICE_INSTANCE_NAMES.has(serviceName)
			) {
				continue;
			}
			this._metrics.setRegisteredInstancesPerService(
				serviceName,
				instances.length
			);
			total += instances.length;
		}
		this._metrics.setRegisteredInstances(total);
	}
}
