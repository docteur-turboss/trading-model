import { createHash } from "node:crypto";
import { CryptoAlg } from "./constants/crypto-constants";

/** Returns the SHA-256 digest of the input, hex encoded. */
export function sha256Hex(input: string): string {
	return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.HEX);
}

/** Returns a base64url string built from `crypto.getRandomValues`, used as a token nonce. */
export function generateRandomStr(): string {
	return Buffer.from(
		crypto.getRandomValues(new Uint32Array(10)).join(""),
		"utf-8"
	).toString(CryptoAlg.BASE64URL);
}
