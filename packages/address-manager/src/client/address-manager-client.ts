import type { HttpClient } from "@trading-model/common/config/http-client";
import { parseServiceName } from "@trading-model/common/config/services.types";
import { HTTP_HEADERS } from "@trading-model/common/http-headers";
import {
	addressManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { AddressManagerConfig } from "../config/address-manager-config";
import { HeartbeatRefresher } from "./heartbeat-refresher";
import { LocalIPDetector } from "./local-ip-detector";
import type { TokenManager } from "./token-manager";
import type {
	RegisterServicePayload,
	ServiceRegistrationResponse,
} from "./type";

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
			port: this._config.servicePort,
			ip: LocalIPDetector.getIP() as import("@trading-model/common/domain/primitives").IPAddress,
		};
	}

	private _getUrls(): string[] {
		return this._config.discoveryUrls?.length
			? this._config.discoveryUrls
			: [this._config.addressManagerUrl];
	}

	registerService(): Promise<ServiceRegistrationResponse | undefined> {
		const payload = this._buildRegistrationPayload();
		const urls = this._getUrls();
		return this._tryRegisterUrls(payload, urls);
	}

	private async _tryRegisterUrls(
		payload: RegisterServicePayload,
		urls: string[]
	): Promise<ServiceRegistrationResponse | undefined> {
		let lastError: unknown;
		for (const url of urls) {
			try {
				return await this._httpClient.post<ServiceRegistrationResponse>(
					`${url}/register`,
					payload
				);
			} catch (error) {
				lastError = error;
			}
		}
		throw addressManagerError("Failed to register service to Address Manager", {
			cause: normalizeError(lastError),
		});
	}

	async refreshTTL(): Promise<void> {
		const urls = this._getUrls();
		await this._heartbeatRefresher.refresh(urls);
	}

	async unregisterService(): Promise<void> {
		const token = this._tokenManager.getToken();
		const urls = this._getUrls();
		await this._tryUnregisterUrls(token, urls);
	}

	private async _tryUnregisterUrls(
		token: string,
		urls: string[]
	): Promise<void> {
		for (const url of urls) {
			try {
				await this._httpClient.post(
					`${url}/unregister`,
					{
						serviceName: this._config.identity.serviceName,
						instanceId: this._config.identity.instanceId,
					},
					{ headers: { [HTTP_HEADERS.X_INSTANCE_TOKEN]: token } }
				);
				return;
			} catch {}
		}
	}

	hasIpChanged(): boolean {
		return LocalIPDetector.hasChanged();
	}
}
