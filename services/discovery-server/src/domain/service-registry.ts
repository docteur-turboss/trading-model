import type {
	AuthToken,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { InstanceStore } from "../adapters/outbound/instance-store";
import {
	setRegisteredInstances,
	setRegisteredInstancesPerService,
} from "../infrastructure/monitoring/metrics";
import type { ServiceInstance } from "../shared/types";
import { InstanceTokenManager } from "./instance-token-manager";
import type { IInstanceStore } from "./ports/instance-store.interface";

export class ServiceRegistry {
	public readonly tokenManager: InstanceTokenManager;
	public readonly instanceStore: IInstanceStore;

	constructor(signingSecret?: string, instanceStore?: IInstanceStore) {
		this.tokenManager = new InstanceTokenManager(signingSecret);
		this.instanceStore = instanceStore ?? new InstanceStore();
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
			setRegisteredInstancesPerService(serviceName, instances.length);
			total += instances.length;
		}
		setRegisteredInstances(total);
	}
}
