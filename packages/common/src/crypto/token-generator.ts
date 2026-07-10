import { createHmac } from "node:crypto";
import type { InstanceId } from "../domain/primitives";
import { generateRandomStr } from "./random";
import { CRYPTO } from "./crypto-constants";

export function generateInstanceToken(
	instanceId: InstanceId,
	signingSecret: string
): string {
	const encodedId = Buffer.from(instanceId, CRYPTO.UTF8).toString(CRYPTO.BASE64URL);
	const nonce = generateRandomStr();

	const hmac = createHmac(CRYPTO.SHA256, signingSecret)
		.update(`${encodedId}.${nonce}`)
		.digest(CRYPTO.BASE64URL);

	return `${encodedId}.${nonce}.${hmac}`;
}
