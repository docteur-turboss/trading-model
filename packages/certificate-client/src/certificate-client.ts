import fs from "node:fs/promises";
import path from "node:path";

import {
	createCsrAsync,
	generateKeyPairAsync,
} from "@trading-model/certificate-utils/async";
import { KeyAlgorithm } from "@trading-model/certificate-utils/generate-key-pair";
import { CaClient } from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";

export interface CertificateClientConfig {
	caUrl: string;
	serviceId: string;
	commonName: string;
	san: string[];
	certPath: string;
	keyPath: string;
	caPath: string;
	bootstrapToken?: string;
	keyAlgorithm?: KeyAlgorithm;
	renewMarginMs?: number;
	tls?: import("@trading-model/common/domain/tls-paths").TlsPaths;
	onRenew?: (cert: ObtainedCertificate) => void;
}

export interface ObtainedCertificate {
	certPem: string;
	keyPem: string;
	caPem: string;
	serialNumber: string;
	expiresAt: Date;
}

export class CertificateClient {
	private readonly _config: CertificateClientConfig;
	private readonly _caClient: CaClient;
	private _obtainedCert: ObtainedCertificate | null = null;
	private _renewTimer: ReturnType<typeof setTimeout> | null = null;

	constructor(config: CertificateClientConfig) {
		this._config = config;
		this._caClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
	}

	async obtainCertificate(): Promise<ObtainedCertificate> {
		const keyPair = await generateKeyPairAsync(
			this._config.keyAlgorithm ?? KeyAlgorithm.ecP384
		);
		const csr = await createCsrAsync({
			commonName: this._config.commonName,
			san: this._config.san,
			keyPem: keyPair.privateKey,
		});

		const response = await this._caClient.signCertificate(
			this._config.serviceId,
			csr,
			{
				bootstrapToken: this._config.bootstrapToken,
			}
		);

		const certDir = path.dirname(this._config.certPath);
		await fs.mkdir(certDir, { recursive: true });

		await fs.writeFile(this._config.keyPath, keyPair.privateKey, {
			mode: 0o600,
		});
		await fs.writeFile(this._config.certPath, response.cert, { mode: 0o644 });
		await fs.writeFile(this._config.caPath, response.caPem, { mode: 0o644 });

		this._obtainedCert = {
			certPem: response.cert,
			keyPem: keyPair.privateKey,
			caPem: response.caPem,
			serialNumber: response.serialNumber,
			expiresAt: new Date(response.expiresAt),
		};

		logger.info("Certificate obtained", {
			serviceId: this._config.serviceId,
			serialNumber: response.serialNumber,
			expiresAt: response.expiresAt,
		});

		if (this._config.onRenew) {
			const cert = this._obtainedCert;
			const onRenew = this._config.onRenew;
			if (cert && onRenew) {
				setImmediate(() => onRenew(cert));
			}
		}

		return this._obtainedCert;
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

	private async _scheduleRenew(marginMs: number): Promise<void> {
		if (!this._obtainedCert) {
			await this.obtainCertificate();
		}

		if (!this._obtainedCert) {
			throw new Error("Failed to obtain certificate");
		}

		const expiresAt = this._obtainedCert.expiresAt.getTime();
		const now = Date.now();
		const remaining = expiresAt - now;

		if (remaining <= marginMs) {
			try {
				await this.obtainCertificate();
			} catch (err) {
				logger.error("Certificate renewal failed", { err });
			}
			await this._scheduleRenew(marginMs);
			return;
		}

		const delay = remaining - marginMs;
		this._renewTimer = setTimeout(() => {
			this.obtainCertificate()
				.then(() => this._scheduleRenew(marginMs))
				.catch((err) => {
					logger.error("Certificate renewal failed, retrying", { err });
					this._renewTimer = setTimeout(
						() => this._scheduleRenew(marginMs),
						60000
					);
				});
		}, delay);

		if (this._obtainedCert) {
			logger.info("Certificate renewal scheduled", {
				serviceId: this._config.serviceId,
				delay,
				expiresAt: this._obtainedCert.expiresAt,
			});
		}
	}

	getCurrentCert(): ObtainedCertificate | null {
		return this._obtainedCert;
	}
}
