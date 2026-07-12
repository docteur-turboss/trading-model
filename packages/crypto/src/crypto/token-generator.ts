import { createHmac } from "node:crypto";
import type { InstanceId } from "@trading-model/common/domain/primitives";
import { CryptoAlg } from "./crypto-constants";
import { generateRandomStr } from "./random";

export function generateInstanceToken(
	instanceId: InstanceId,
	signingSecret: string
): string {
	const encodedId = Buffer.from(instanceId, CryptoAlg.UTF8).toString(
		CryptoAlg.BASE64URL
	);
	const nonce = generateRandomStr();

	const hmac = createHmac(CryptoAlg.SHA256, signingSecret)
		.update(`${encodedId}.${nonce}`)
		.digest(CryptoAlg.BASE64URL);

	return `${encodedId}.${nonce}.${hmac}`;
}
