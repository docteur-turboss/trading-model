import {
	AuthToken,
	type InstanceId,
} from "@trading-model/primitives/primitives";
import { createHmacSha256Formatted } from "../../adapters/outbound/node-hmac";
import { generateRandomStr } from "../../adapters/outbound/node-random";
import { CryptoAlg } from "../../domain/constants/crypto-constants";

/** Builds a discovery instance token `<base64url id>.<nonce>.<hmac>` signed with the signing secret. */
export function generateInstanceToken(
	instanceId: InstanceId,
	signingSecret: string
): AuthToken {
	const encodedId = Buffer.from(instanceId, CryptoAlg.UTF8).toString(
		CryptoAlg.BASE64URL
	);
	const nonce = generateRandomStr();

	const hmac = createHmacSha256Formatted({
		secret: signingSecret,
		parts: [encodedId, nonce],
		separator: ".",
		digest: CryptoAlg.BASE64URL,
	});

	return AuthToken.of(`${encodedId}.${nonce}.${hmac}`);
}
