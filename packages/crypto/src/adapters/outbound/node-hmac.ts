import { createHmac, timingSafeEqual } from "node:crypto";
import { CryptoAlg } from "../../domain/constants/crypto-constants";

export type HmacDigestEncoding = "hex" | "base64" | "base64url";

export interface HmacSha256Input {
	secret: string;
	parts: string[];
	separator: string;
	digest: HmacDigestEncoding;
}

/** Computes an HMAC-SHA256 over the joined parts with the given secret. */
export function createHmacSha256Formatted(input: HmacSha256Input): string {
	return createHmac(CryptoAlg.SHA256, input.secret)
		.update(input.parts.join(input.separator))
		.digest(input.digest);
}

/** HMAC-SHA256 of the parts joined by ":", hex encoded. */
export function createHmacSha256(secret: string, ...parts: string[]): string {
	return createHmacSha256Formatted({
		secret,
		parts,
		separator: ":",
		digest: CryptoAlg.HEX,
	});
}

export function verifyHmacSha256(
	secret: string,
	signature: string,
	...parts: string[]
): boolean {
	return safeEqual(signature, createHmacSha256(secret, ...parts));
}

export function verifyHmacSha256Formatted(
	input: HmacSha256Input & { signature: string }
): boolean {
	return safeEqual(input.signature, createHmacSha256Formatted(input));
}

/** Compares two strings in constant time; returns false on length mismatch or malformed input. */
function safeEqual(left: string, right: string): boolean {
	// biome-ignore lint/plugin: malformed input means the signatures do not match
	try {
		return (
			left.length === right.length &&
			timingSafeEqual(Buffer.from(left), Buffer.from(right))
		);
	} catch {
		return false;
	}
}
