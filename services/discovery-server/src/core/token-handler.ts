import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type {
	InstanceId,
	ServiceId,
} from "@trading-model/common/domain/primitives";
import { toServiceId } from "@trading-model/common/domain/primitives";
import type { ServiceEndpoint } from "@trading-model/common/domain/service-identity";
import type { TokenValidation } from "@trading-model/common/domain/token-validation";
import {
	generateInstanceId,
	generateInstanceToken,
	type TokenValidationInput,
	validInstanceToken,
	verifyInstanceName,
} from "@trading-model/crypto/crypto/token-service";
import type { ITokenManager } from "@trading-model/validation/contracts/service-registry.types";
import type Redis from "ioredis";
import { instanceToken } from "./redis-key-builder";

export class TokenHandler implements ITokenManager {
	constructor(
		private readonly _redis: Redis,
		private readonly _keyPrefix: string,
		private readonly _signingSecret: string
	) {}

	async updateToken(instanceId: InstanceId): Promise<string> {
		const newToken = this._generateInstanceToken(instanceId);
		await this._redis.set(instanceToken(this._keyPrefix, instanceId), newToken);
		return newToken;
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return this._generateInstanceToken(instanceId);
	}

	private _generateInstanceToken(instanceId: InstanceId): string {
		return generateInstanceToken(instanceId, this._signingSecret);
	}

	async validInstanceToken({
		token,
		instanceId,
	}: TokenValidation): Promise<boolean> {
		const storedToken = await this._redis.get(
			instanceToken(this._keyPrefix, instanceId)
		);
		const input: TokenValidationInput = {
			token,
			instanceId:
				instanceId as import("@trading-model/common/domain/primitives").InstanceId,
			signingSecret: this._signingSecret,
			storedToken,
		};
		const result = validInstanceToken(input);
		if (!result) {
			logger.warn("Token validation failed", { instanceId });
		}
		return result;
	}

	generateInstanceId(endpoint: ServiceEndpoint): ServiceId {
		return toServiceId(generateInstanceId(endpoint));
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return verifyInstanceName(serviceName as never);
	}
}
