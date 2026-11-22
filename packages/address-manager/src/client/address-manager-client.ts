import { parseServiceName } from "@trading-model/common/config/services.types";
import { normalizeError } from "@trading-model/common/utils/errors";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { ServiceRegistrationWire } from "@trading-model/contracts/wire/service-instance";
import type { HttpClient } from "@trading-model/http/http-client";
import { logger } from "@trading-model/http/logger";
import type { IPAddress } from "@trading-model/primitives/primitives";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import type { AddressManagerConfig } from "../config/address-manager-config";
import { LocalIPDetector } from "../shared/client/local-ip-detector";
import { addressManagerError } from "../shared/errors";
import type { TokenManager } from "./token-manager";
import type {
	RegisterServicePayload,
	ServiceRegistrationResponse,
} from "./type";

/** Client of the discovery server: registration, heartbeats and token refresh. */
export class AddressManagerClient {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _tokenManager: TokenManager,
		private readonly _config: AddressManagerConfig
	) {}

	private _buildRegistrationPayload(): RegisterServicePayload {
		return {
			serviceName: parseServiceName(this._config.identity.serviceName),
			// Heartbeats and token rotation send this identity: without it discovery
			// generates another instanceId and every later call is rejected (401).
			instanceId: this._config.identity.instanceId,
			port: this._config.servicePort,
			version: this._config.serviceVersion,
			ip: LocalIPDetector.getIP() as IPAddress,
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
				{ idempotent: true, serviceName: ServiceId.of("discovery-server") },
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
		// Never concurrent with a token rotation (TokenManager.exclusive).
		await this._tokenManager.exclusive(async () => {
			try {
				await this._httpClient.post(
					this._url("/heartbeat"),
					this._config.identity,
					{
						headers: {
							[HTTP_HEADERS.X_INSTANCE_TOKEN]: this._tokenManager.getToken(),
						},
						idempotent: true,
						serviceName: ServiceId.of("discovery-server"),
					}
				);
			} catch (error) {
				throw addressManagerError("Failed to refresh service TTL", {
					cause: normalizeError(error),
				});
			}
		});
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
					serviceName: ServiceId.of("discovery-server"),
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
