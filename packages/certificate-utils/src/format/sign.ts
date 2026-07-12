import { createPublicKey, createSign } from "node:crypto";
import { KeyPem } from "@trading-model/common/domain/primitives";

import type { KeyPair, SignInput } from "../keygen/types";

export function parseKey(privateKey: string): KeyPair {
	const publicKey = createPublicKey(privateKey).export({
		type: "spki",
		format: "pem",
	});
	return {
		publicKey: KeyPem.of(publicKey),
		privateKey: KeyPem.of(privateKey),
	};
}

export function sign(input: SignInput): string {
	const sign = createSign(input.algorithm);
	sign.update(input.body);
	return sign.sign(input.privateKey, "base64");
}
