import type {
	AuthToken,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { InstanceStore } from "./instance-store";
import { InstanceTokenManager } from "./instance-token-manager";
import type { ServiceInstance } from "./types";

export class ServiceRegistry {
	public readonly tokenManager: InstanceTokenManager;
	public readonly instanceStore = new InstanceStore();

	constructor(signingSecret?: string) {
		this.tokenManager = new InstanceTokenManager(signingSecret);
	}

	registerInstance(instance: ServiceInstance) {
		const { instanceId } = instance;
		const token = this.tokenManager.generateToken(instanceId);
		this.instanceStore.registerInstance(instance);
		this.tokenManager.setToken(instanceId, token as unknown as AuthToken);
		const stored = this.instanceStore.getInstance({
			serviceName: instance.serviceName,
			instanceId,
		});
		return { ...stored!, token };
	}

	updateToken(instanceId: InstanceId): string {
		const newToken = this.tokenManager.generateToken(instanceId);
		this.tokenManager.setToken(instanceId, newToken as unknown as AuthToken);
		return newToken;
	}

	removeInstance(identity: ServiceIdentity): boolean {
		const result = this.instanceStore.removeInstance(identity);
		this.tokenManager.deleteToken(identity.instanceId);
		return result;
	}
}
