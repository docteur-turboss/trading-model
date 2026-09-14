import { CryptoAlg } from "../domain/constants/crypto-constants";

export function generateRandomStr(): string {
	return Buffer.from(
		crypto.getRandomValues(new Uint32Array(10)).join(""),
		"utf-8"
	).toString(CryptoAlg.BASE64URL);
}
