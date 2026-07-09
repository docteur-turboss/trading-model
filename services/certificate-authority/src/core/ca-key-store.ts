import {
	createPublicKey,
	existsSync,
	mkdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import type { KeyPair } from "@trading-model/certificate-utils/types";

export class CaKeyStore {
	constructor(private readonly _caKeyPath: string) {}

	load(): KeyPair | null {
		if (!existsSync(this._caKeyPath)) {
			return null;
		}
		const privateKey = readFileSync(this._caKeyPath, "utf8");
		const publicKey = createPublicKey(privateKey).export({
			type: "spki",
			format: "pem",
		});
		return { publicKey, privateKey };
	}

	save(privateKey: string): void {
		const dir = this._caKeyPath.substring(0, this._caKeyPath.lastIndexOf("/"));
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(this._caKeyPath, privateKey, { mode: 0o600 });
	}
}
