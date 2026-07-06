import fs from "node:fs/promises";
import path from "node:path";

import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import type { CertificateBase } from "@trading-model/common/domain/certificate-base";
import { CaClient } from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";

export interface CertificateClientConfig {
	caUrl: string;
	serviceId: string;
	commonName: string;
	san: string[];
	tlsPaths: TlsPaths;
	bootstrapToken?: string;
	keyAlgorithm?: KeyAlgorithm;
	renewMarginMs?: number;
	tls?: TlsPaths;
	onRenew?: (cert: ObtainedCertificate) => void;
}

export interface ObtainedCertificate extends CertificateBase {
	keyPem: string;
}

export class CertificateClient {
	private readonly _config: CertificateClientConfig;
	private readonly _caClient: CaClient;
	private _obtainedCert: ObtainedCertificate | null = null;
	private _renewTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: CertificateClientConfig, initialCert?: ObtainedCertificate) {
		this._config = config;
		this._obtainedCert = initialCert ?? null;
		this._caClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
	}

	static async createObtained(config: CertificateClientConfig): Promise<CertificateClient> {
		const client = new CertificateClient(config);
		await client.obtainCertificate();
		return client;
	}

	private async _generateKeyAndCsr(): Promise<{
		keyPair: import("@trading-model/certificate-utils/generate-key-pair").KeyPair;
		csr: string;
	}> {
		const keyPair = await generateKeyPairAsync(
			this._config.keyAlgorithm ?? KeyAlgorithm.ecP384,
		);
		const csr = await createCsrAsync({
			commonName: this._config.commonName,
			san: this._config.san,
			keyPem: keyPair.privateKey,
		});
		return { keyPair, csr };
	}

	private async _signWithCa(csr: string) {
		return await this._caClient.signCertificate(this._config.serviceId, csr, {
			bootstrapToken: this._config.bootstrapToken,
		});
	}

	private async _writeCertificates(keyPair: { privateKey: string }, response: { cert: string; caPem: string }): Promise<void> {
		const { tlsPaths } = this._config;
		const certDir = path.dirname(tlsPaths.certPath);
		await fs.mkdir(certDir, { recursive: true });
		await fs.writeFile(tlsPaths.keyPath, keyPair.privateKey, { mode: 0o600 });
		await fs.writeFile(tlsPaths.certPath, response.cert, { mode: 0o644 });
		await fs.writeFile(tlsPaths.caPath, response.caPem, { mode: 0o644 });
	}

	private _buildObtainedCert(keyPair: { privateKey: string }, response: { cert: string; caPem: string; serialNumber: string; expiresAt: string }): ObtainedCertificate {
		return {
			certPem: response.cert,
			keyPem: keyPair.privateKey,
			caPem: response.caPem,
			serialNumber: response.serialNumber,
			expiresAt: new Date(response.expiresAt),
		};
	}

	private _notifyOnRenew(): void {
		const cert = this._obtainedCert;
		const onRenew = this._config.onRenew;
		if (cert && onRenew) {
			setImmediate(() => onRenew(cert));
		}
	}

	async obtainCertificate(): Promise<ObtainedCertificate> {
		const { keyPair, csr } = await this._generateKeyAndCsr();
		const response = await this._signWithCa(csr);
		await this._writeCertificates(keyPair, response);
		this._obtainedCert = this._buildObtainedCert(keyPair, response);
		logger.info("Certificate obtained", {
			serviceId: this._config.serviceId,
			serialNumber: response.serialNumber,
			expiresAt: response.expiresAt,
		});
		this._notifyOnRenew();
		return this._obtainedCert!;
	}

	startAutoRenew(): void {
		if (this._renewTimer) {
			return;
		}

		const marginMs = this._config.renewMarginMs ?? 86400000;
		void this._scheduleRenew(marginMs);
	}

	stopAutoRenew(): void {
		if (this._renewTimer) {
			clearTimeout(this._renewTimer);
			this._renewTimer = null;
		}
	}

	private async _ensureObtained(): Promise<void> {
		if (!this._obtainedCert) {
			await this.obtainCertificate();
		}
		if (!this._obtainedCert) {
			throw new Error("Failed to obtain certificate");
		}
	}

	private async _handleExpired(marginMs: number): Promise<void> {
		try {
			await this.obtainCertificate();
		} catch (err) {
			logger.error("Certificate renewal failed", { err });
		}
		await this._scheduleRenew(marginMs);
	}

	private _setupRenewTimer(delay: number, marginMs: number): void {
		this._renewTimer = setTimeout(() => {
			this.obtainCertificate()
				.then(() => this._scheduleRenew(marginMs))
				.catch((err) => {
					logger.error("Certificate renewal failed, retrying", { err });
					this._renewTimer = setTimeout(
						() => this._scheduleRenew(marginMs),
						60000,
					);
				});
		}, delay);
	}

	private _logRenewScheduled(delay: number): void {
		logger.info("Certificate renewal scheduled", {
			serviceId: this._config.serviceId,
			delay,
			expiresAt: this._obtainedCert!.expiresAt,
		});
	}

	private async _scheduleRenew(marginMs: number): Promise<void> {
		await this._ensureObtained();
		const expiresAt = this._obtainedCert!.expiresAt.getTime();
		const remaining = expiresAt - Date.now();

		if (remaining <= marginMs) {
			await this._handleExpired(marginMs);
			return;
		}

		const delay = remaining - marginMs;
		this._setupRenewTimer(delay, marginMs);
		this._logRenewScheduled(delay);
	}

	getCurrentCert(): ObtainedCertificate | null {
		return this._obtainedCert;
	}
}
