import { createHmac, timingSafeEqual } from "node:crypto";
import { CryptoAlg } from "./crypto-constants";

export function createHmacSha256(secret: string, ...parts: string[]): string {
	return createHmac(CryptoAlg.SHA256, secret)
		.update(parts.join(":"))
		.digest(CryptoAlg.HEX);
}

export function verifyHmacSha256(
	secret: string,
	signature: string,
	...parts: string[]
): boolean {
	const expected = createHmacSha256(secret, ...parts);
	try {
		return (
			signature.length === expected.length &&
			timingSafeEqual(Buffer.from(signature), Buffer.from(expected))
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
