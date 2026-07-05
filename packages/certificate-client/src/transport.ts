import {
	CaClient,
	type SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";

import { WssTransport } from "./wss-transport";

export type TransportMode = "wss" | "https";

export interface TransportConfig {
	caUrl: string;
	tls?: {
		ca: string;
		cert: string;
		key: string;
	};
	retestWssIntervalMs?: number;
	forceHttps?: boolean;
	bootstrapToken?: string;
}

export class TransportManager {
	private _mode: TransportMode;
	private _wssTransport: WssTransport | null = null;
	private readonly _httpsClient: CaClient;
	private readonly _config: TransportConfig;
	private _unauthRejects = 0;

	constructor(config: TransportConfig) {
		this._config = config;
		this._httpsClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		if (config.forceHttps) {
			this._mode = "https";
		} else {
			this._mode = "wss";
			const wsUrl = config.caUrl.replace(/\/+$/, "").replace(/^https:/, "wss:").replace(/^http:/, "ws:");
			this._wssTransport = new WssTransport(wsUrl, config.tls, config.bootstrapToken);
		}
	}

	get currentMode(): TransportMode {
		return this._mode;
	}

	async signCertificate(
		serviceId: string,
		csr: string,
		options?: { ttlMs?: number }
	): Promise<SignCertificateResponse> {
		if (
			this._mode === "wss" &&
			this._wssTransport?.isConnected
		) {
			if (!this._wssTransport.isAuthSent) {
				this._unauthRejects++;
				if (this._unauthRejects > 3) {
					logger.warn(
						"WSS not authenticated after 3 attempts, falling back to HTTPS"
					);
					this._mode = "https";
					return this._httpsClient.signCertificate(serviceId, csr, options);
				}
			}
			try {
				return await this._wssTransport.signCertificate(serviceId, csr, options);
			} catch (err) {
				logger.error("WSS sign failed, falling back to HTTPS", { err });
			}
		}
		return this._httpsClient.signCertificate(serviceId, csr, options);
	}

	async getCertificate(
		serviceId: string
	): Promise<
		import("@trading-model/common/ca/ca-client").GetCertificateResponse | null
	> {
		return await this._httpsClient.getCertificate(serviceId);
	}

	async revokeCertificate(serialNumber: string, reason: string): Promise<void> {
		return await this._httpsClient.revokeCertificate(serialNumber, reason);
	}

	async getCrl(since?: string): Promise<
		Array<{
			serialNumber: string;
			serviceId: string;
			revokedAt: string;
			reason: string;
		}>
	> {
		return await this._httpsClient.getCrl(since);
	}

	destroy(): void {
		this._wssTransport?.destroy();
	}
}
