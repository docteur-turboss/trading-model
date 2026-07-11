import { createPublicKey } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type { KeyPair } from "@trading-model/certificate-utils/types";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import type { FilePath } from "@trading-model/common/domain/primitives";
import { KeyPem } from "@trading-model/common/domain/primitives";

export class CaKeyStore {
	constructor(private readonly _caKeyPath: FilePath) {}

	load(): KeyPair | null {
		if (!existsSync(this._caKeyPath)) {
			return null;
		}
		const privateKey = readFileSync(this._caKeyPath, CryptoAlg.UTF8);
		const publicKey = KeyPem.of(
			createPublicKey(privateKey).export({
				type: "spki",
				format: "pem",
			})
		);
		return { publicKey, privateKey: KeyPem.of(privateKey) };
	}

	save(privateKey: string): void {
		const dir = this._caKeyPath.substring(0, this._caKeyPath.lastIndexOf("/"));
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(this._caKeyPath, privateKey, { mode: 0o600 });
	}
}
