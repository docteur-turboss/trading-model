import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { generateRandomStr } from "@trading-model/common/crypto/random";
import {
	generateInstanceId,
	type TokenValidationInput,
} from "@trading-model/common/crypto/token-service";
import {
	type AuthToken,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import type {
	ServiceEndpoint,
	ServiceIdentity,
} from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import { InstanceStore } from "./instance-store";
import { TokenService } from "./token-service";
import type { ServiceInstance } from "./types";

export class ServiceRegistry {
	private readonly _tokenService: TokenService;
	private readonly _instanceStore = new InstanceStore();
	private _token: Map<InstanceId, AuthToken> = new Map();

	constructor(signingSecret?: string) {
		this._tokenService = new TokenService(signingSecret ?? generateRandomStr());
	}

	registerInstance(instance: ServiceInstance) {
		const { instanceId } = instance;
		const token = this._tokenService.generateInstanceToken(instanceId);
		this._instanceStore.registerInstance(instance);
		this._token.set(instanceId, token);
		const stored = this._instanceStore.getInstance({
			serviceName: instance.serviceName,
			instanceId,
		});
		return { ...stored!, token };
	}

	updateHeartbeat(identity: ServiceIdentity): number | false {
		return this._instanceStore.updateHeartbeat(identity);
	}

	updateToken(instanceId: InstanceId): string {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		this._token.set(instanceId, newToken);
		return newToken;
	}

	getInstances(serviceName: ServiceInstanceName): ServiceInstance[] {
		return this._instanceStore.getInstances(serviceName);
	}

	getInstance(identity: ServiceIdentity): ServiceInstance | undefined {
		return this._instanceStore.getInstance(identity);
	}

	removeInstance(identity: ServiceIdentity): boolean {
		const result = this._instanceStore.removeInstance(identity);
		this._token.delete(identity.instanceId);
		return result;
	}

	listServiceNames(): ServiceInstanceName[] {
		return this._instanceStore.listServiceNames();
	}

	dump(): Partial<Record<ServiceInstanceName, ServiceInstance[]>> {
		return this._instanceStore.dump();
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return this._tokenService.generateInstanceToken(instanceId);
	}

	generateInstanceId(endpoint: ServiceEndpoint): string {
		return generateInstanceId(endpoint);
	}

	validInstanceToken({ token, instanceId }: TokenValidation): boolean {
		const storedToken = this._token.get(instanceId);
		const input: TokenValidationInput = {
			token,
			instanceId: InstanceId.of(instanceId),
			signingSecret: "",
			storedToken,
		};
		return this._tokenService.validInstanceToken(input);
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}
}
