import { createHash } from "node:crypto";
import { CryptoAlg } from "./crypto-constants";

export function sha256Hex(input: string): string {
	return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.HEX);
}

export function sha256Base64url(input: string): string {
	return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.BASE64URL);
}
