import { createHmac, timingSafeEqual } from "node:crypto";

import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { generateRandomStr } from "@trading-model/common/crypto/random";
import { validInstanceToken as commonValidateToken } from "@trading-model/common/crypto/token-service";
import type { InstanceId } from "@trading-model/common/domain/primitives";

export class TokenService {
	private readonly _signingSecret: string;

	constructor(signingSecret: string) {
		this._signingSecret = signingSecret;
	}

	generateInstanceToken(instanceId: string): string {
		const encodedId = Buffer.from(instanceId, "utf8").toString("base64url");
		const timestamp = Buffer.from(`${Date.now()}`, "utf8").toString(
			"base64url"
		);
		const nonce = generateRandomStr();

		const hmac = createHmac("sha256", this._signingSecret)
			.update(`${encodedId}.${timestamp}.${nonce}`)
			.digest("base64url");

		return `${encodedId}.${timestamp}.${nonce}.${hmac}`;
	}

	validInstanceToken(
		token: string,
		instanceId: string,
		storedToken?: string
	): boolean {
		const result = commonValidateToken({
			token,
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
		return (Object.values(ServiceInstanceName) as readonly string[]).includes(
			serviceName
		);
	}
}
