import { createHash } from "node:crypto";
import { CryptoAlg } from "./constants/crypto-constants";

/** Returns the SHA-256 digest of the input, hex encoded. */
export function sha256Hex(input: string): string {
	return createHash(CryptoAlg.SHA256).update(input).digest(CryptoAlg.HEX);
}
