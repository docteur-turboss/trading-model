import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { ITokenManager } from "@trading-model/common/contracts/service-registry.types";
import type {
	InstanceId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import type { TokenHandler } from "./token-handler";

export class TokenManagerService implements ITokenManager {
	constructor(private readonly _tokenHandler: TokenHandler) {}

	updateToken(instanceId: InstanceId): Promise<string> {
		return this._tokenHandler.updateToken(instanceId);
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return this._tokenHandler.generateInstanceToken(instanceId);
	}

	validInstanceToken(validation: TokenValidation): Promise<boolean> {
		return this._tokenHandler.validInstanceToken(validation);
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return this._tokenHandler.generateInstanceId(endpoint);
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return this._tokenHandler.verifyInstanceName(serviceName);
	}
}
