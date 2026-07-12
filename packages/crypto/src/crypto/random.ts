import { CryptoAlg } from "./crypto-constants";

export const generateRandomStr = (): string =>
	Buffer.from(
		crypto.getRandomValues(new Uint32Array(10)).join(""),
		"utf-8"
	).toString(CryptoAlg.BASE64URL);
