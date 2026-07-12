import { logger } from "@trading-model/common/config/logger";
import type { ServiceInstanceName } from "@trading-model/common/config/services.types";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import {
	generateInstanceToken as commonGenerateToken,
	validInstanceToken as commonValidateToken,
	verifyInstanceName as commonVerifyName,
	type TokenValidationInput,
} from "@trading-model/crypto/crypto/token-service";

export class TokenService {
	private readonly _signingSecret: string;

	constructor(signingSecret: string) {
		this._signingSecret = signingSecret;
	}

	generateInstanceToken(instanceId: InstanceId): string {
		return commonGenerateToken(instanceId, this._signingSecret);
	}

	validInstanceToken(input: TokenValidationInput): boolean {
		const merged: TokenValidationInput = {
			...input,
			signingSecret: this._signingSecret,
		};
		const result = commonValidateToken(merged);
		if (!result) {
			logger.warn("Token validation failed", {
				instanceId: input.instanceId,
			});
		}
		return result;
	}

	verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return commonVerifyName(serviceName as never);
	}

	/**
	 * Generate an instance token using an explicitly provided signing secret.
	 * Matches the signature of `@trading-model/common/crypto/token-service#generateInstanceToken`.
	 */
	static generateInstanceToken(
		instanceId: InstanceId,
		signingSecret: string
	): string {
		return commonGenerateToken(instanceId, signingSecret);
	}

	/**
	 * Validate a token using an explicitly provided signing secret.
	 * Matches the signature of `@trading-model/common/crypto/token-service#validInstanceToken`.
	 */
	static validInstanceToken(input: TokenValidationInput): boolean {
		return commonValidateToken(input);
	}

	/**
	 * Verify an instance name against known service names.
	 * Matches the signature of `@trading-model/common/crypto/token-service#verifyInstanceName`.
	 */
	static verifyInstanceName(serviceName: ServiceInstanceName): boolean {
		return commonVerifyName(serviceName as never);
	}
}
