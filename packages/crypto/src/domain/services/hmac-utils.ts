import { createHmac, timingSafeEqual } from "node:crypto";
import { CryptoAlg } from "../constants/crypto-constants";

export type HmacDigestEncoding = "hex" | "base64" | "base64url";

export interface HmacSha256Input {
	secret: string;
	parts: string[];
	separator: string;
	digest: HmacDigestEncoding;
}

export function createHmacSha256(secret: string, ...parts: string[]): string {
	return createHmacSha256Formatted({
		secret,
		parts,
		separator: ":",
		digest: CryptoAlg.HEX,
	});
}

export function createHmacSha256Formatted(input: HmacSha256Input): string {
	return createHmac(CryptoAlg.SHA256, input.secret)
		.update(input.parts.join(input.separator))
		.digest(input.digest);
}

export function verifyHmacSha256(
	secret: string,
	signature: string,
	...parts: string[]
): boolean {
	return verifyHmacSha256Formatted({
		secret,
		signature,
		parts,
		separator: ":",
		digest: CryptoAlg.HEX,
	});
}

export function verifyHmacSha256Formatted(
	input: HmacSha256Input & { signature: string }
): boolean {
	const expected = createHmacSha256Formatted(input);
	try {
		return (
			input.signature.length === expected.length &&
			timingSafeEqual(Buffer.from(input.signature), Buffer.from(expected))
		);
	} catch {
		return false;
	}
}

export function isTimestampFresh(
	timestamp: number,
	toleranceMs = 300_000
): boolean {
	return (
		!Number.isNaN(timestamp) && Math.abs(Date.now() - timestamp) <= toleranceMs
	);
}
