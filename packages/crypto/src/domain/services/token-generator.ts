import type { InstanceId } from "@trading-model/common/domain/primitives";
import { CryptoAlg } from "../constants/crypto-constants";
import { createHmacSha256Formatted } from "./hmac-utils";
import { generateRandomStr } from "./random";

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
