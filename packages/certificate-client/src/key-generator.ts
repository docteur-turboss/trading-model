import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import type { KeyPair } from "@trading-model/certificate-utils/types";

export interface KeyGeneratorConfig {
	keyAlgorithm?: KeyAlgorithm;
	commonName: string;
	san: string[];
}

export class KeyGenerator {
	constructor(private readonly _config: KeyGeneratorConfig) {}

	async generateKeyAndCsr(): Promise<{
		keyPair: KeyPair;
		csr: string;
	}> {
		const keyPair = await generateKeyPairAsync(
			this._config.keyAlgorithm ?? KeyAlgorithm.ecP384
		);
		const csr = await createCsrAsync({
			commonName: this._config.commonName,
			san: this._config.san,
			keyPem: keyPair.privateKey,
		});
		return { keyPair, csr };
	}
}
