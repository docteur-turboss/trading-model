import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import {
	type AuthToken,
	InstanceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import { generateRandomStr } from "@trading-model/crypto/crypto/random";
import {
	generateInstanceId,
	generateInstanceToken,
	type TokenValidationInput,
	validInstanceToken,
	verifyInstanceName,
} from "@trading-model/crypto/crypto/token-service";

export class InstanceTokenManager {
	private readonly _signingSecret: string;
	private readonly _tokens = new Map<InstanceId, AuthToken>();

	constructor(signingSecret?: string) {
		this._signingSecret = signingSecret ?? generateRandomStr();
	}

	generateInstanceId(endpoint: ServiceEndpoint): string {
		return generateInstanceId(endpoint);
	}

	generateToken(instanceId: InstanceId): string {
		return generateInstanceToken(instanceId, this._signingSecret);
	}

	setToken(instanceId: InstanceId, token: AuthToken): void {
		this._tokens.set(instanceId, token);
	}

	deleteToken(instanceId: InstanceId): void {
		this._tokens.delete(instanceId);
	}

	validInstanceToken({ token, instanceId }: TokenValidation): boolean {
		const storedToken = this._tokens.get(instanceId);
		const input: TokenValidationInput = {
			token,
			instanceId: InstanceId.of(instanceId),
			signingSecret: this._signingSecret,
			storedToken,
		};
		return validInstanceToken(input);
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return verifyInstanceName(serviceName as never);
	}
}
