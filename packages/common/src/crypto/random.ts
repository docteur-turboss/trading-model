import { CRYPTO } from "./crypto-constants";

export const generateRandomStr = (): string =>
	Buffer.from(
		crypto.getRandomValues(new Uint32Array(10)).join(""),
		"utf-8"
	).toString(CRYPTO.BASE64URL);
