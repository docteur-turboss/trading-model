import { CryptoAlg } from "../domain/constants/crypto-constants";

/** Returns a base64url string built from `crypto.getRandomValues`, used as a token nonce. */
export function generateRandomStr(): string {
	return Buffer.from(
		crypto.getRandomValues(new Uint32Array(10)).join(""),
		"utf-8"
	).toString(CryptoAlg.BASE64URL);
}
