import type {
	CaClient,
	SignCertificateRequest,
	SignCertificateResponse,
} from "@trading-model/common/ca/ca-client";
import { logger } from "@trading-model/common/config/logger";
import type { NullCaWssTransport } from "./wss-transport";
import { CaWssTransport, NULL_CA_WSS_TRANSPORT } from "./wss-transport";

export enum TransportMode {
	Wss = "wss",
	Https = "https",
}

export interface TransportConfig {
	caUrl: string;
	tls?: import("@trading-model/common/domain/tls-paths").TlsPaths;
	retestWssIntervalMs?: number;
	forceHttps?: boolean;
	bootstrapToken?: string;
}

const MAX_UNAUTH_REJECTS = 3;

export class WssFallbackStrategy {
	private _mode: TransportMode;
	private _wssTransport: CaWssTransport | NullCaWssTransport;
	private _unauthRejects = 0;

	constructor(config: TransportConfig) {
		if (config.forceHttps) {
			this._mode = TransportMode.Https;
			this._wssTransport = NULL_CA_WSS_TRANSPORT;
		} else {
			this._mode = TransportMode.Wss;
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

	private _checkWssAuthThreshold(): boolean {
		if (!this._wssTransport.isAuthSent) {
			this._unauthRejects++;
			if (this._unauthRejects > MAX_UNAUTH_REJECTS) {
				logger.warn(
					`WSS not authenticated after ${MAX_UNAUTH_REJECTS} attempts, falling back to HTTPS`
				);
				this._mode = TransportMode.Https;
				return true;
			}
		}
		return false;
	}

	async signCertificate(
		request: SignCertificateRequest,
		httpsClient: CaClient
	): Promise<SignCertificateResponse> {
		if (this._mode === TransportMode.Wss && this._wssTransport.isConnected) {
			if (this._checkWssAuthThreshold()) {
				return httpsClient.signCertificate(request);
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
