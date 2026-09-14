import { createHmac, timingSafeEqual } from "node:crypto";
import { CryptoAlg } from "../domain/constants/crypto-constants";
import type { HmacSha256Input } from "../domain/ports/hmac-port";

export function computeHmacSha256(input: HmacSha256Input): string {
	return createHmac(CryptoAlg.SHA256, input.secret)
		.update(input.parts.join(input.separator))
		.digest(input.digest);
}

export function safeEqual(left: string, right: string): boolean {
	try {
		return (
			left.length === right.length &&
			timingSafeEqual(Buffer.from(left), Buffer.from(right))
		);
	} catch {
		return false;
	}
}
