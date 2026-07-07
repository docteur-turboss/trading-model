import { createHmac } from "node:crypto";
import type { InstanceId } from "../domain/primitives";
import { generateRandomStr } from "./random";

export function generateInstanceToken(
	instanceId: InstanceId,
	signingSecret: string
): string {
	const encodedId = Buffer.from(instanceId, "utf8").toString("base64url");
	const nonce = generateRandomStr();

	const hmac = createHmac("sha256", signingSecret)
		.update(`${encodedId}.${nonce}`)
		.digest("base64url");

	return `${encodedId}.${nonce}.${hmac}`;
}
