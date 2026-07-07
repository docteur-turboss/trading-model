import { createHash, randomUUID } from "node:crypto";
import { generateKeyPair, KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import type { KeyPair } from "@trading-model/certificate-utils/types";
import { toFingerprint, toSerialNumber } from "@trading-model/common/domain/primitives";
import type { CaStore } from "../persistence/ca-store";
import { CaKeyStore } from "./ca-key-store";
import { CertBodyBuilder } from "./cert-body-builder";

export interface BootstrapResult {
	caKeyPair: KeyPair;
	caCertPem: string;
}

export class CaBootstrapper {
	private readonly _certBodyBuilder = new CertBodyBuilder();
	private readonly _keyStore: CaKeyStore;

	constructor(caKeyPath: string, private readonly _caCertTtlMs: number) {
		this._keyStore = new CaKeyStore(caKeyPath);
	}

	async loadOrBootstrap(caStore: CaStore): Promise<BootstrapResult> {
		const keyState = this._keyStore.load();
		if (keyState) {
			const storedCa = await caStore.getLatest();
			if (storedCa) return { caKeyPair: keyState.caKeyPair, caCertPem: storedCa.caCertPem };
		}
		return this._bootstrap(caStore);
	}
	private _generateSerialNumber(): string { return randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase(); }
	private _buildCaCert(serialNumber: string, now: Date, expiresAt: Date, caKeyPair: KeyPair): string {
		const certBody = this._certBodyBuilder.build({ serialNumber: toSerialNumber(serialNumber), now, expiresAt, publicKey: caKeyPair.publicKey, isCa: true });
		return this._certBodyBuilder.signAndBuildPem(certBody, caKeyPair.privateKey);
	}
	private async _bootstrap(caStore: CaStore): Promise<BootstrapResult> {
		const caKeyPair = generateKeyPair(KeyAlgorithm.rsa4096);
		const serialNumber = this._generateSerialNumber();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + this._caCertTtlMs);
		const caCertPem = this._buildCaCert(serialNumber, now, expiresAt, caKeyPair);
		this._keyStore.save(caKeyPair.privateKey);
		await caStore.save({ id: toSerialNumber(serialNumber), caCertPem, createdAt: now, expiresAt, fingerprint: toFingerprint(createHash("sha256").update(caCertPem).digest("hex")) });
		return { caKeyPair, caCertPem };
	}
}
