import { createPublicKey, createSign } from "node:crypto";

import type { KeyPair, SignInput } from "./types";

export function parseKey(privateKey: string): KeyPair {
	const publicKey = createPublicKey(privateKey).export({
		type: "spki",
		format: "pem",
	});
	return { publicKey, privateKey };
}

export function sign(input: SignInput): string {
	const sign = createSign(input.algorithm);
	sign.update(input.body);
	return sign.sign(input.privateKey, "base64");
}
