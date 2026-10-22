import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type AuthToken,
	InstanceId,
} from "@trading-model/primitives/primitives";
import type { ServiceEndpoint } from "@trading-model/primitives/service-identity";
import type { TokenValidation } from "@trading-model/primitives/token-validation";
import type { TokenCryptoPort } from "./ports/token-crypto.port";

export class InstanceTokenManager {
	private readonly _tokens = new Map<InstanceId, AuthToken>();

	constructor(
		private readonly _crypto: TokenCryptoPort,
		private readonly _signingSecret: string
	) {}

	generateInstanceId(endpoint: ServiceEndpoint): string {
		return this._crypto.generateInstanceId(endpoint);
	}

	generateToken(instanceId: InstanceId): string {
		return this._crypto.generateInstanceToken(instanceId, this._signingSecret);
	}

	setToken(instanceId: InstanceId, token: AuthToken): void {
		this._tokens.set(instanceId, token);
	}

	deleteToken(instanceId: InstanceId): void {
		this._tokens.delete(instanceId);
	}

	validInstanceToken({ token, instanceId }: TokenValidation): boolean {
		return this._crypto.validInstanceToken({
			token,
			instanceId: InstanceId.of(instanceId),
			signingSecret: this._signingSecret,
			storedToken: this._tokens.get(instanceId),
		});
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return this._crypto.verifyInstanceName(serviceName);
	}
}
