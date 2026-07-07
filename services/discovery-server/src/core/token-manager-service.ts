import type { ITokenManager } from "@trading-model/common/contracts/service-registry.types";
import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type { TokenHandler } from "./token-handler";

export class TokenManagerService implements ITokenManager {
	constructor(private readonly _tokenHandler: TokenHandler) {}

	async updateToken(instanceId: string): Promise<string> {
		return this._tokenHandler.updateToken(instanceId);
	}

	generateInstanceToken(instanceId: string): string {
		return this._tokenHandler.generateInstanceToken(instanceId);
	}

	async validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._tokenHandler.validInstanceToken(validation);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._tokenHandler.generateInstanceId(endpoint);
	}

	verifyInstanceName(serviceName: string): boolean {
		return this._tokenHandler.verifyInstanceName(serviceName);
	}
}
