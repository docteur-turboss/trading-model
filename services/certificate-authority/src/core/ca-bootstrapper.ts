import { createHash, randomUUID } from "node:crypto";
import {
	generateKeyPair,
	KeyAlgorithm,
} from "@trading-model/certificate-utils/generate-key-pair";
import type { KeyPair } from "@trading-model/certificate-utils/types";
import { CryptoAlg } from "@trading-model/common/crypto/crypto-constants";
import {
	type CaPem,
	type DurationMs,
	type FilePath,
	type SerialNumber,
	toCaPem,
	toFingerprint,
	toSerialNumber,
} from "@trading-model/common/domain/primitives";
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
		const keyState = this._keyStore.load();
		if (keyState) {
			const storedCa = await caStore.getLatest();
			if (storedCa) {
				return { caKeyPair: keyState, caCertPem: storedCa.caCertPem };
			}
		}
		return this._bootstrap(caStore);
	}
	private _generateSerialNumber(): SerialNumber {
		return toSerialNumber(
			randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase()
		);
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
			this._certBodyBuilder.signAndBuildPem(
				certBody,
				params.caKeyPair.privateKey
			)
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
		this._keyStore.save(caKeyPair.privateKey);
		await caStore.insert({
			id: serialNumber,
			caCertPem,
			createdAt: now,
			expiresAt,
			fingerprint: toFingerprint(
				createHash(CryptoAlg.SHA256).update(caCertPem).digest(CryptoAlg.HEX)
			),
		});
		return { caKeyPair, caCertPem };
	}
}
