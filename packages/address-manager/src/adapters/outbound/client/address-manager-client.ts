import { parseServiceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { logger } from "@trading-model/http/infrastructure/logger";
import { URLString } from "@trading-model/primitives/primitives";
import { ServiceRegistrationWire } from "@trading-model/validation/wire/service-instance";
import type { TokenManager } from "../../../application/client/token-manager";
import type {
	RegisterServicePayload,
	ServiceRegistrationResponse,
} from "../../../domain/client/type";
import type { AddressManagerConfig } from "../../../domain/config/address-manager-config";
import { LocalIPDetector } from "../../../shared/client/local-ip-detector";
import { addressManagerError } from "../../../shared/errors";
import { HeartbeatRefresher } from "./heartbeat-refresher";

export class AddressManagerClient {
	private readonly _heartbeatRefresher: HeartbeatRefresher;

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _tokenManager: TokenManager,
		private readonly _config: AddressManagerConfig
	) {
		this._heartbeatRefresher = new HeartbeatRefresher(
			this._httpClient,
			this._tokenManager,
			this._config.identity
		);
	}

	static resetLocalIP(): void {
		LocalIPDetector.reset();
	}

	private _buildRegistrationPayload(): RegisterServicePayload {
		return {
			serviceName: parseServiceName(this._config.identity.serviceName),
			// Heartbeats and token rotation send this identity: without it discovery
			// generates another instanceId and every later call is rejected (401).
			instanceId: this._config.identity.instanceId,
			port: this._config.servicePort,
			ip: LocalIPDetector.getIP() as import("@trading-model/primitives/primitives").IPAddress,
		};
	}

	private _url(path: string): URLString {
		return URLString.of(`${this._config.addressManagerUrl}${path}`);
	}

	async registerService(): Promise<ServiceRegistrationResponse | undefined> {
		try {
			return await this._httpClient.post(
				this._url("/register"),
				this._buildRegistrationPayload(),
				// Discovery merges a second registration of the same instanceId.
				{ idempotent: true },
				ServiceRegistrationWire
			);
		} catch (error) {
			throw addressManagerError(
				"Failed to register service to Address Manager",
				{ cause: normalizeError(error) }
			);
		}
	}

	async refreshTTL(): Promise<void> {
		await this._heartbeatRefresher.refresh(
			URLString.of(this._config.addressManagerUrl)
		);
	}

	async unregisterService(): Promise<void> {
		const token = this._tokenManager.getToken();
		try {
			await this._httpClient.post(
				this._url("/unregister"),
				this._config.identity,
				{
					headers: { [HTTP_HEADERS.X_INSTANCE_TOKEN]: token },
					idempotent: true,
				}
			);
		} catch (err) {
			logger.warn("Failed to unregister from Address Manager", {
				url: this._config.addressManagerUrl,
				err: normalizeError(err).message,
			});
		}
	}

	hasIpChanged(): boolean {
		return LocalIPDetector.hasChanged();
	}
}
