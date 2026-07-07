import { logger } from "@trading-model/common/config/logger";
import {
	generateInstanceToken as commonGenerateToken,
	validInstanceToken as commonValidateToken,
	verifyInstanceName as commonVerifyName,
	type TokenValidationInput,
} from "@trading-model/common/crypto/token-service";
import type { InstanceId } from "@trading-model/common/domain/primitives";

export class TokenService {
	private readonly _signingSecret: string;

	constructor(signingSecret: string) {
		this._signingSecret = signingSecret;
	}

	generateInstanceToken(instanceId: string): string {
		return commonGenerateToken(
			instanceId as InstanceId,
			this._signingSecret
		);
	}

	validInstanceToken(input: TokenValidationInput): boolean;
	validInstanceToken(
		token: string,
		instanceId: string,
		storedToken?: string
	): boolean;
	validInstanceToken(
		tokenOrInput: string | TokenValidationInput,
		instanceId?: string,
		storedToken?: string
	): boolean {
		if (typeof tokenOrInput === "object") {
			const input = {
				...tokenOrInput,
				signingSecret: tokenOrInput.signingSecret ?? this._signingSecret,
			};
			const result = commonValidateToken(input);
			if (!result) {
				logger.warn("Token validation failed", {
					instanceId: input.instanceId,
				});
			}
			return result;
		}
		const result = commonValidateToken({
			token: tokenOrInput,
			instanceId: instanceId as InstanceId,
			signingSecret: this._signingSecret,
			storedToken,
		});
		if (!result) {
			logger.warn("Token validation failed", { instanceId });
		}
		return result;
	}

	verifyInstanceName(serviceName: string): boolean {
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
	static verifyInstanceName(serviceName: string): boolean {
		return commonVerifyName(serviceName as never);
	}
}
