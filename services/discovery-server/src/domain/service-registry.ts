import type {
	AuthToken,
	InstanceId,
} from "@trading-model/primitives/primitives";
import type { ServiceIdentity } from "@trading-model/primitives/service-identity";
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
		this.tokenManager.setToken(instanceId, token as unknown as AuthToken);
		const stored = await this.instanceStore.getInstance({
			serviceName: instance.serviceName,
			instanceId,
		});
		await this._syncRegisteredInstanceMetrics();
		return { ...stored!, token };
	}

	updateToken(instanceId: InstanceId): string {
		const newToken = this.tokenManager.generateToken(instanceId);
		this.tokenManager.setToken(instanceId, newToken as unknown as AuthToken);
		return newToken;
	}

	async removeInstance(identity: ServiceIdentity): Promise<boolean> {
		const result = await this.instanceStore.removeInstance(identity);
		this.tokenManager.deleteToken(identity.instanceId);
		if (result) {
			await this._syncRegisteredInstanceMetrics();
		}
		return result;
	}

	private async _syncRegisteredInstanceMetrics(): Promise<void> {
		const serviceNames = await this.instanceStore.listServiceNames();
		let total = 0;
		for (const serviceName of serviceNames) {
			const instances = await this.instanceStore.getInstances(serviceName);
			this._metrics.setRegisteredInstancesPerService(
				serviceName,
				instances.length
			);
			total += instances.length;
		}
		this._metrics.setRegisteredInstances(total);
	}
}
