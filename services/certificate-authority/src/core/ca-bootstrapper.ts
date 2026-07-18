import {
	generateKeyPair,
	generateSerialNumber,
	KeyAlgorithm,
} from "@trading-model/certificate-utils";
import type { KeyPair } from "@trading-model/certificate-utils/types";
import {
	type CaPem,
	type DurationMs,
	type FilePath,
	type SerialNumber,
	toCaPem,
	toFingerprint,
} from "@trading-model/common/domain/primitives";
import { sha256Hex } from "@trading-model/crypto/crypto/hash-utils";
import type { CaStore } from "../persistence/ca-store";
import { CaKeyStore } from "./ca-key-store";
import { CertBodyBuilder } from "./cert-body-builder";

export interface BootstrapResult {
	caKeyPair: KeyPair;
	caCertPem: CaPem;
}

export class CaBootstrapper {
	private readonly _certBodyBuilder = new CertBodyBuilder();
	private readonly _keyStore: CaKeyStore;

	constructor(
		caKeyPath: FilePath,
		private readonly _caCertTtlMs: DurationMs
	) {
		this._keyStore = new CaKeyStore(caKeyPath);
	}

	async loadOrBootstrap(caStore: CaStore): Promise<BootstrapResult> {
		const keyState = this._keyStore.read();
		if (keyState) {
			const storedCa = await caStore.getLatest();
			if (storedCa) {
				return { caKeyPair: keyState, caCertPem: storedCa.caCertPem };
			}
		}
		return this._bootstrap(caStore);
	}
	private _generateSerialNumber(): SerialNumber {
		return generateSerialNumber();
	}
	private _buildCaCert(params: {
		serialNumber: SerialNumber;
		now: Date;
		expiresAt: Date;
		caKeyPair: KeyPair;
	}): CaPem {
		const certBody = this._certBodyBuilder.build({
			serialNumber: params.serialNumber,
			now: params.now,
			expiresAt: params.expiresAt,
			publicKey: params.caKeyPair.publicKey,
			isCa: true,
		});
		return toCaPem(
			this._certBodyBuilder.signAndBuildPem({
				certBody,
				privateKey: params.caKeyPair.privateKey,
			})
		);
	}
	private async _bootstrap(caStore: CaStore): Promise<BootstrapResult> {
		const caKeyPair = generateKeyPair(KeyAlgorithm.Rsa4096);
		const serialNumber = this._generateSerialNumber();
		const now = new Date();
		const expiresAt = new Date(Date.now() + this._caCertTtlMs);
		const caCertPem = this._buildCaCert({
			serialNumber,
			now,
			expiresAt,
			caKeyPair,
		});
		this._keyStore.write(caKeyPair.privateKey);
		await caStore.insert({
			id: serialNumber,
			caCertPem,
			createdAt: now,
			expiresAt,
			fingerprint: toFingerprint(sha256Hex(caCertPem)),
		});
		return { caKeyPair, caCertPem };
	}
}
