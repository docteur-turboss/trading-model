import { createHmac, timingSafeEqual } from "node:crypto";
import { logger } from "@trading-model/common/config/logger";
import { ServiceInstanceName } from "@trading-model/common/config/services.types";
import { generateRandomStr } from "@trading-model/common/crypto/random";

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
		const parts = token.split(".");
		if (parts.length !== 4) {
			return false;
		}

		const [encodedId, timestamp, nonce, signature] = parts;

		const decodedId = Buffer.from(encodedId, "base64url").toString("utf8");
		if (decodedId !== instanceId) {
			return false;
		}

		const expectedHmac = createHmac("sha256", this._signingSecret)
			.update(`${encodedId}.${timestamp}.${nonce}`)
			.digest("base64url");

		try {
			if (
				!timingSafeEqual(Buffer.from(expectedHmac), Buffer.from(signature))
			) {
				return false;
			}
		} catch (err) {
			logger.warn("Token validation failed", {
				instanceId,
				err,
			});
			return false;
		}

		if (storedToken !== undefined) {
			return storedToken === token;
		}
		return true;
	}

	verifyInstanceName(serviceName: string): boolean {
		return (
			Object.values(ServiceInstanceName) as readonly string[]
		).includes(serviceName);
	}
}
