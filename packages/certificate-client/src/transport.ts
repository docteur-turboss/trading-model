import {
	CaClient,
	type SignCertificateRequest,
	type SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";

import type {
	SerialNumber,
	ServiceId,
} from "@trading-model/common/domain/primitives";
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

class WssFallbackStrategy {
	private _mode: TransportMode;
	private _wssTransport: CaWssTransport | NullCaWssTransport;
	private _unauthRejects = 0;

	constructor(config: TransportConfig) {
		if (config.forceHttps) {
			this._mode = "https";
			this._wssTransport = new NullCaWssTransport();
		} else {
			this._mode = "wss";
			this._wssTransport = new CaWssTransport(
				this._buildWsUrl(config.caUrl),
				config.tls,
				config.bootstrapToken
			);
		}
	}

	get currentMode(): TransportMode {
		return this._mode;
	}

	async signCertificate(
		request: SignCertificateRequest,
		httpsClient: CaClient
	): Promise<SignCertificateResponse> {
		if (this._mode === "wss" && this._wssTransport.isConnected) {
			if (!this._wssTransport.isAuthSent) {
				this._unauthRejects++;
				if (this._unauthRejects > 3) {
					logger.warn(
						"WSS not authenticated after 3 attempts, falling back to HTTPS"
					);
					this._mode = "https";
					return httpsClient.signCertificate(request);
				}
			}
			try {
				return await this._wssTransport.signCertificate(request);
			} catch (err) {
				logger.error("WSS sign failed, falling back to HTTPS", { err });
			}
		}
		return httpsClient.signCertificate(request);
	}

	disconnect(): void {
		this._wssTransport.disconnect();
	}

	private _buildWsUrl(caUrl: string): string {
		return caUrl
			.replace(/\/+$/, "")
			.replace(/^https:/, "wss:")
			.replace(/^http:/, "ws:");
	}
}

export class TransportManager {
	private readonly _httpsClient: CaClient;
	private readonly _strategy: WssFallbackStrategy;

	constructor(config: TransportConfig) {
		this._httpsClient = new CaClient({
			baseUrl: config.caUrl,
			tls: config.tls,
		});
		this._strategy = new WssFallbackStrategy(config);
	}

	get currentMode(): TransportMode {
		return this._strategy.currentMode;
	}

	signCertificate(
		request: SignCertificateRequest
	): Promise<SignCertificateResponse> {
		return this._strategy.signCertificate(request, this._httpsClient);
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
			serialNumber: SerialNumber;
			serviceId: ServiceId;
			revokedAt: string;
			reason: string;
		}>
	> {
		return await this._httpsClient.getCrl(since);
	}

	disconnect(): void {
		this._strategy.disconnect();
	}

	/** @deprecated Use {@link disconnect()} instead */
	destroy(): void {
		this.disconnect();
	}
}
