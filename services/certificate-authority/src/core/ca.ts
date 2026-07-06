import {
	createHash,
	createPublicKey,
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

import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import { ENV } from "../config/env";
import type { CaStore } from "../persistence/ca-store";
import type { CertificateStore } from "../persistence/certificate-store";
import { CertBodyBuilder } from "./cert-body-builder";
import type { CrlStore } from "../persistence/crl-store";

export interface CaOptions {
	caKeyPath: string;
	caCertTtlMs: number;
	certificateStore: CertificateStore;
	crlStore: CrlStore;
	caStore: CaStore;
}

export interface CertBodyInput {
	serialNumber: string;
	now: Date;
	expiresAt: Date;
	publicKey: string;
}

export class CertificateAuthority {
	private _caKeyPair!: KeyPair;
	private _caCertPem = "";
	private readonly _options: CaOptions;
	private readonly _certBodyBuilder = new CertBodyBuilder();

	constructor(options: CaOptions) {
		this._options = options;
	}

	static async create(options: CaOptions): Promise<CertificateAuthority> {
		const ca = new CertificateAuthority(options);
		await ca.initialize();
		return ca;
	}

	async initialize(): Promise<void> {
		await this._loadOrBootstrapCa();
	}

	private _ensureInitialized(): void {
		if (!this._caKeyPair) {
			throw new Error("CA not initialized. Call initialize() or use CertificateAuthority.create().");
		}
	}

	private _loadKeyFromDisk(): boolean {
		if (!existsSync(this._options.caKeyPath)) {
			return false;
		}
		const privateKey = readFileSync(this._options.caKeyPath, "utf8");
		const publicKey = createPublicKey(privateKey).export({
			type: "spki",
			format: "pem",
		});
		this._caKeyPair = { publicKey, privateKey };
		return true;
	}

	private async _loadOrBootstrapCa(): Promise<void> {
		if (this._loadKeyFromDisk()) {
			const storedCa = await this._options.caStore.getLatest();
			if (storedCa) {
				this._caCertPem = storedCa.caCertPem;
				return;
			}
		}
		await this._bootstrapCa();
	}

	private _generateSerialNumber(): string {
		return randomUUID().replace(/-/g, "").substring(0, 16).toUpperCase();
	}

	private async _bootstrapCa(): Promise<void> {
		this._caKeyPair = generateKeyPair(KeyAlgorithm.rsa4096);
		const serialNumber = this._generateSerialNumber();
		const now = new Date();
		const expiresAt = new Date(now.getTime() + this._options.caCertTtlMs);
		const certBody = this._certBodyBuilder.buildCertBody({ serialNumber, now, expiresAt, publicKey: this._caKeyPair.publicKey });
		this._caCertPem = this._certBodyBuilder.signCertBody(certBody, this._caKeyPair.privateKey);
		this._saveCaKey(this._caKeyPair.privateKey);
		await this._saveCaCert(this._caCertPem, serialNumber, now, expiresAt);
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
		this._ensureInitialized();
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

	private _buildRevokedCertificate(request: RevocationRequest, serviceId: string): RevokedCertificate {
		return {
			serialNumber: request.serialNumber,
			serviceId,
			revokedAt: new Date(),
			reason: request.reason,
		};
	}

	async revokeCertificate(request: RevocationRequest): Promise<void> {
		const cert = await this._options.certificateStore.getBySerial(request.serialNumber);
		if (!cert) {
			throw new Error(`Certificate ${request.serialNumber} not found`);
		}
		const revoked = this._buildRevokedCertificate(request, cert.serviceId);
		await this._options.crlStore.add(revoked);
	}

	async getCrl(): Promise<RevokedCertificate[]> {
		return await this._options.crlStore.getAll();
	}

	getCaCertPem(): string {
		return this._caCertPem;
	}

	isInitialized(): boolean {
		return !!this._caKeyPair && this._caCertPem.length > 0;
	}
}
