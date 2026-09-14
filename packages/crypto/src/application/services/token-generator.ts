import type { InstanceId } from "@trading-model/common/domain/primitives";
import { createHmacSha256Formatted } from "../../adapters/outbound/node-hmac";
import { generateRandomStr } from "../../adapters/outbound/node-random";
import { CryptoAlg } from "../../domain/constants/crypto-constants";

export function generateInstanceToken(
	instanceId: InstanceId,
	signingSecret: string
): string {
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

	return `${encodedId}.${nonce}.${hmac}`;
}
