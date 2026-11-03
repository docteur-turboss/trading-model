import { CryptoAlg } from "../../domain/constants/crypto-constants";
import type { HmacPort, HmacSha256Input } from "../../domain/ports/hmac-port";
import {
	computeHmacSha256,
	safeEqual,
} from "../../infrastructure/hmac-primitives";

export const nodeHmacAdapter: HmacPort = {
	createHmacSha256(secret: string, ...parts: string[]): string {
		return computeHmacSha256({
			secret,
			parts,
			separator: ":",
			digest: CryptoAlg.HEX,
		});
	},

	createHmacSha256Formatted(input: HmacSha256Input): string {
		return computeHmacSha256(input);
	},

	verifyHmacSha256(
		secret: string,
		signature: string,
		...parts: string[]
	): boolean {
		const expected = computeHmacSha256({
			secret,
			parts,
			separator: ":",
			digest: CryptoAlg.HEX,
		});
		return safeEqual(signature, expected);
	},

	verifyHmacSha256Formatted(
		input: HmacSha256Input & { signature: string }
	): boolean {
		return safeEqual(input.signature, computeHmacSha256(input));
	},
};

export const createHmacSha256 = nodeHmacAdapter.createHmacSha256;
export const createHmacSha256Formatted =
	nodeHmacAdapter.createHmacSha256Formatted;
export const verifyHmacSha256 = nodeHmacAdapter.verifyHmacSha256;
export const verifyHmacSha256Formatted =
	nodeHmacAdapter.verifyHmacSha256Formatted;
