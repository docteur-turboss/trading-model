import { createHmac, randomBytes } from "node:crypto";

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
	private _token: Map<string, string> = new Map();

	constructor(signingSecret?: string) {
		this._tokenService = new TokenService(
			signingSecret ?? randomBytes(32).toString("hex")
		);
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

	updateToken(instanceId: string): string {
		const newToken = this._tokenService.generateInstanceToken(instanceId);
		this._token.set(instanceId, newToken);
		return newToken;
	}

	getInstances(serviceName: string): ServiceInstance[] {
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

	listServiceNames(): string[] {
		return this._instanceStore.listServiceNames();
	}

	dump(): Record<string, ServiceInstance[]> {
		return this._instanceStore.dump();
	}

	generateInstanceToken(instanceId: string): string {
		return this._tokenService.generateInstanceToken(instanceId);
	}

	generateInstanceId({ serviceName, address, port }: ServiceEndpoint): string {
		return createHmac("sha256", randomBytes(32).toString("hex"))
			.update(`${serviceName}-${address}:${port}-${Date.now()}`)
			.digest("base64");
	}

	validInstanceToken({ token, instanceId }: TokenValidation): boolean {
		const storedToken = this._token.get(instanceId);
		return this._tokenService.validInstanceToken(
			token,
			instanceId,
			storedToken
		);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenService.verifyInstanceName(serviceName);
	}
}
