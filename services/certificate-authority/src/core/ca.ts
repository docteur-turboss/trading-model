import {
	createHash,
	createPublicKey,
	createSign,
	randomUUID,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

import {
	generateKeyPair,
	KeyAlgorithm,
} from "@trading-model/certificate-utils/generate-key-pair";
import {
	type SignOptions,
	signCertificate,
} from "@trading-model/certificate-utils/sign-certificate";
import type {
	KeyPair,
	RevokedCertificate,
	SignedCertificate,
} from "@trading-model/certificate-utils/types";

import { ENV } from "../config/env";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import type { CrlStore } from "../persistence/crl-store";

export interface CaOptions {
	caKeyPath: string;
	caCertTtlMs: number;
	certificateStore: CertificateStore;
	crlStore: CrlStore;
	caStore: CaStore;
}

export class CertificateAuthority {
	private _caKeyPair: KeyPair | null = null;
	private _caCertPem = "";
	private readonly _options: CaOptions;

	constructor(options: CaOptions) {
		this._options = options;
	}

	async initialize(): Promise<void> {
		await this._loadOrBootstrapCa();
	}

	private async _loadOrBootstrapCa(): Promise<void> {
		if (existsSync(this._options.caKeyPath)) {
			const privateKey = readFileSync(this._options.caKeyPath, "utf8");
			const publicKey = createPublicKey(privateKey).export({
				type: "spki",
				format: "pem",
			});
			this._caKeyPair = { publicKey, privateKey };

			const storedCa = await this._options.caStore.getLatest();
			if (storedCa) {
				this._caCertPem = storedCa.caCertPem;
				return;
			}
		}

		await this._bootstrapCa();
	}

	private async _bootstrapCa(): Promise<void> {
		this._caKeyPair = generateKeyPair(KeyAlgorithm.rsa4096);

		const serialNumber = randomUUID()
			.replace(/-/g, "")
			.substring(0, 16)
			.toUpperCase();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + this._options.caCertTtlMs);

		const certBody = this._buildCertBody(
			serialNumber,
			now,
			expiresAt,
			this._caKeyPair.publicKey
		);
		this._caCertPem = this._signCertBody(certBody, this._caKeyPair.privateKey);
		this._saveCaKey(this._caKeyPair.privateKey);
		await this._saveCaCert(this._caCertPem, serialNumber, now, expiresAt);
	}

	private _buildCertBody(
		serialNumber: string,
		now: Date,
		expiresAt: Date,
		publicKey: string
	): string {
		return [
			`Serial: ${serialNumber}`,
			"Issuer: CN=TradingModelCA",
			"Subject: CN=TradingModelCA",
			`Not Before: ${now.toISOString()}`,
			`Not After: ${expiresAt.toISOString()}`,
			"CA: TRUE",
			`Public Key: ${publicKey}`,
		].join("\n");
	}

	private _signCertBody(certBody: string, privateKey: string): string {
		const sign = createSign("sha256");
		sign.update(certBody);
		const signature = sign.sign(privateKey, "base64");

		return [
			"-----BEGIN CERTIFICATE-----",
			...chunks(
				Buffer.from(JSON.stringify({ body: certBody, signature })).toString(
					"base64"
				),
				64
			),
			"-----END CERTIFICATE-----",
		].join("\n");
	}

	private _saveCaKey(privateKey: string): void {
		const dir = this._options.caKeyPath.substring(
			0,
			this._options.caKeyPath.lastIndexOf("/")
		);
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true });
		}
		writeFileSync(this._options.caKeyPath, privateKey, {
			mode: 0o600,
		});
	}

	private async _saveCaCert(
		caCertPem: string,
		serialNumber: string,
		now: Date,
		expiresAt: Date
	): Promise<void> {
		await this._options.caStore.save({
			id: serialNumber,
			caCertPem,
			createdAt: now,
			expiresAt,
			fingerprint: createHash("sha256").update(caCertPem).digest("hex"),
		});
	}

	async signServiceCertificate(
		serviceId: string,
		csr: string,
		ttlMs?: number
	): Promise<SignedCertificate> {
		if (!this._caKeyPair) {
			throw new Error("CA not initialized");
		}

		const options: SignOptions = {
			csr,
			serviceId,
			caKeyPair: this._caKeyPair,
			caCertPem: this._caCertPem,
			ttlMs: ttlMs ?? ENV.CERT_DEFAULT_TTL_MS,
		};

		const signed = signCertificate(options);

		await this._options.certificateStore.save(signed);

		return signed;
	}

	async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
		const cert = await this._options.certificateStore.getBySerial(serialNumber);
		if (!cert) {
			throw new Error(`Certificate ${serialNumber} not found`);
		}

		const revoked: RevokedCertificate = {
			serialNumber,
			serviceId: cert.serviceId,
			revokedAt: new Date(),
			reason,
		};

		await this._options.crlStore.add(revoked);
	}

	async getCrl(): Promise<RevokedCertificate[]> {
		return await this._options.crlStore.getAll();
	}

	getCaCertPem(): string {
		return this._caCertPem;
	}

	isInitialized(): boolean {
		return this._caKeyPair !== null && this._caCertPem.length > 0;
	}
}

function chunks(str: string, size: number): string[] {
	const result: string[] = [];
	for (let i = 0; i < str.length; i += size) {
		result.push(str.slice(i, i + size));
	}
	return result;
}
