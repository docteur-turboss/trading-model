import { createHash } from "node:crypto";
import { CryptoAlg } from "../domain/constants/crypto-constants";

/** Returns the SHA-256 digest of the input, hex encoded. */
export function sha256Hex(input: string): string {
	return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.HEX);
}

/** Returns the SHA-256 digest of the input, base64url encoded. */
export function sha256Base64url(input: string): string {
	return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.BASE64URL);
}
