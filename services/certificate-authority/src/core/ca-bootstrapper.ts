import { createHash, createPublicKey, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
	generateKeyPair,
	KeyAlgorithm,
} from "@trading-model/certificate-utils/generate-key-pair";
import type { KeyPair } from "@trading-model/certificate-utils/types";
import type { CaStore } from "../persistence/ca-store";
import { CertBodyBuilder } from "./cert-body-builder";

export interface BootstrapResult {
	caKeyPair: KeyPair;
	caCertPem: string;
}

export class CaBootstrapper {
	private readonly _certBodyBuilder = new CertBodyBuilder();

	constructor(
		private readonly _caKeyPath: string,
		private readonly _caCertTtlMs: number
	) {}

	loadKeyFromDisk(): BootstrapResult | null {
		if (!existsSync(this._caKeyPath)) {
			return null;
		}
		const privateKey = readFileSync(this._caKeyPath, "utf8");
		const publicKey = createPublicKey(privateKey).export({
			type: "spki",
			format: "pem",
		});
		return { caKeyPair: { publicKey, privateKey }, caCertPem: "" };
	}

	async loadOrBootstrap(caStore: CaStore): Promise<BootstrapResult> {
		const keyState = this.loadKeyFromDisk();
		if (keyState) {
			const storedCa = await caStore.getLatest();
			if (storedCa) {
				return {
					caKeyPair: keyState.caKeyPair,
					caCertPem: storedCa.caCertPem,
				};
			}
		}
		return this._bootstrap(caStore);
	}

	private _generateSerialNumber(): string {
		return randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase();
	}

	private async _bootstrap(caStore: CaStore): Promise<BootstrapResult> {
		const caKeyPair = generateKeyPair(KeyAlgorithm.rsa4096);
		const serialNumber = this._generateSerialNumber();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + this._caCertTtlMs);
		const certBody = this._certBodyBuilder.buildCertBody({
			serialNumber,
			now,
			expiresAt,
			publicKey: caKeyPair.publicKey,
		});
		const caCertPem = this._certBodyBuilder.signAndBuildPem(
			certBody,
			caKeyPair.privateKey
		);
		this._saveCaKey(caKeyPair.privateKey);
		await this._saveCaCert(caCertPem, serialNumber, now, expiresAt, caStore);
		return { caKeyPair, caCertPem };
	}

	private _saveCaKey(privateKey: string): void {
		const dir = this._caKeyPath.substring(0, this._caKeyPath.lastIndexOf("/"));
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(this._caKeyPath, privateKey, {
			mode: 0o600,
		});
	}

	private async _saveCaCert(
		caCertPem: string,
		serialNumber: string,
		now: Date,
		expiresAt: Date,
		caStore: CaStore
	): Promise<void> {
		await caStore.save({
			id: serialNumber,
			caCertPem,
			createdAt: now,
			expiresAt,
			fingerprint: createHash("sha256").update(caCertPem).digest("hex"),
		});
	}
}
