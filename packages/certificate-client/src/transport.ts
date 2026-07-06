import {
	CaClient,
	type SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";

import type { ServiceId } from "@trading-model/common/domain/primitives";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { CaWssTransport, NullCaWssTransport } from "./wss-transport";

export type TransportMode = "wss" | "https";

export interface TransportConfig {
	caUrl: string;
	tls?: TlsPaths;
	retestWssIntervalMs?: number;
	forceHttps?: boolean;
	bootstrapToken?: string;
}

export class TransportManager {
	private _mode: TransportMode;
	private _wssTransport: CaWssTransport | NullCaWssTransport;
	private readonly _httpsClient: CaClient;
	private readonly _config: TransportConfig;
	private _unauthRejects = 0;

	constructor(config: TransportConfig) {
		this._config = config;
		this._httpsClient = new CaClient({ baseUrl: config.caUrl, tls: config.tls });
		if (config.forceHttps) {
			this._mode = "https";
			this._wssTransport = new NullCaWssTransport();
		} else {
			this._mode = "wss";
			this._wssTransport = new CaWssTransport(
				this._buildWsUrl(config.caUrl),
				config.tls,
				config.bootstrapToken,
			);
		}
	}

	private _buildWsUrl(caUrl: string): string {
		return caUrl
			.replace(/\/+$/, "")
			.replace(/^https:/, "wss:")
			.replace(/^http:/, "ws:");
	}

	get currentMode(): TransportMode {
		return this._mode;
	}

	async signCertificate(
		serviceId: ServiceId,
		csr: string,
		options?: { ttlMs?: number }
	): Promise<SignCertificateResponse> {
		if (this._mode === "wss" && this._wssTransport.isConnected) {
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
				return await this._wssTransport.signCertificate(
					serviceId,
					csr,
					options
				);
			} catch (err) {
				logger.error("WSS sign failed, falling back to HTTPS", { err });
			}
		}
		return this._httpsClient.signCertificate(serviceId, csr, options);
	}

	async getCertificate(
		serviceId: ServiceId
	): Promise<
		import("@trading-model/common/ca/ca-client").GetCertificateResponse | null
	> {
		return await this._httpsClient.getCertificate(serviceId);
	}

	async revokeCertificate(request: RevocationRequest): Promise<void> {
		return await this._httpsClient.revokeCertificate(request);
	}

	async getCrl(since?: string): Promise<
		Array<{
			serialNumber: string;
			serviceId: ServiceId;
			revokedAt: string;
			reason: string;
		}>
	> {
		return await this._httpsClient.getCrl(since);
	}

	disconnect(): void {
		this.destroy();
	}

	destroy(): void {
		this._wssTransport.destroy();
	}
}
