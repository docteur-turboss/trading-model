import type {
	SerialNumber,
	ServiceId,
	URLString,
} from "@trading-model/common/domain/primitives";
import type { RevocationRequest } from "@trading-model/common/domain/revocation-request";
import type { TlsPaths } from "@trading-model/common/domain/tls-paths";
import { CaClient } from "@trading-model/crypto/ca/ca-client";
import {
	type TransportMode,
	WssFallbackStrategy,
} from "./wss-fallback-strategy";

export type { TransportConfig } from "./wss-fallback-strategy";
export { TransportMode } from "./wss-fallback-strategy";

export class TransportManager {
	private readonly _httpsClient: CaClient;
	private readonly _strategy: WssFallbackStrategy;

	constructor(config: {
		caUrl: URLString;
		tls?: TlsPaths;
		forceHttps?: boolean;
		bootstrapToken?: string;
	}) {
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
		request: import("@trading-model/crypto/ca/ca-client").SignCertificateRequest
	): Promise<
		import("@trading-model/crypto/ca/ca-client").WireCertificateResponse
	> {
		return this._strategy.signCertificate(request, this._httpsClient);
	}

	async getCertificate(
		serviceId: ServiceId
	): Promise<
		import("@trading-model/crypto/ca/ca-client").GetCertificateResponse | null
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
}
