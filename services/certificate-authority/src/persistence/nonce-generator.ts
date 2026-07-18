import { randomBytes } from "node:crypto";
import { CryptoAlg } from "@trading-model/crypto/crypto/crypto-constants";

export class NonceGenerator {
	generate(): string {
		return randomBytes(32).toString(CryptoAlg.HEX);
	}
}
