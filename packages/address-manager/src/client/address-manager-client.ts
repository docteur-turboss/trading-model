import { networkInterfaces } from "node:os";
import type { HttpClient } from "@trading-model/common/config/http-client";
import {
	AppError,
	ErrorCodes,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { AddressManagerConfig } from "../config/address-manager-config";
import type { TokenManager } from "./token-manager";
import type {
	RegisterServicePayload,
	ServiceRegistrationResponse,
} from "./type";

export class AddressManagerClient {
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _tokenManager: TokenManager,
		private readonly _config: AddressManagerConfig
	) {}

	private static _localIP: string | null = null;

	static resetLocalIP(): void {
		AddressManagerClient._localIP = null;
	}

	private static _getLocalIP(): string {
		if (AddressManagerClient._localIP) {
			return AddressManagerClient._localIP;
		}
		const nets = networkInterfaces();
		for (const name of Object.keys(nets)) {
			for (const net of nets[name] ?? []) {
				if (net.family === "IPv4" && !net.internal) {
					AddressManagerClient._localIP = net.address;
					return net.address;
				}
			}
		}
		AddressManagerClient._localIP = "127.0.0.1";
		return "127.0.0.1";
	}

	async registerService(): Promise<ServiceRegistrationResponse | undefined> {
		const payload: RegisterServicePayload = {
			serviceName: this._config.serviceName,
			port: this._config.servicePort,
			ip: AddressManagerClient._getLocalIP(),
		};

		const urls = this._config.discoveryUrls?.length
			? this._config.discoveryUrls
			: [this._config.addressManagerUrl];

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

		throw new AppError(
			"Failed to register service to Address Manager",
			ErrorCodes.ADDRESS_MANAGER_ERROR,
			{ cause: normalizeError(lastError) }
		);
	}

	async refreshTTL(): Promise<void> {
		const token = this._tokenManager.getToken();

		const urls = this._config.discoveryUrls?.length
			? this._config.discoveryUrls
			: [this._config.addressManagerUrl];

		if (urls.length === 1) {
			try {
				await this._httpClient.post(
					`${urls[0]}/heartbeat`,
					{
						serviceName: this._config.serviceName,
						instanceId: this._config.instanceId,
					},
					{
						headers: {
							"x-instance-token": token,
						},
					}
				);
			} catch (error) {
				throw new AppError(
					"Failed to refresh service TTL",
					ErrorCodes.ADDRESS_MANAGER_ERROR,
					{
						cause: normalizeError(error),
					}
				);
			}
			return;
		}

		const results = await Promise.allSettled(
			urls.map((url) =>
				this._httpClient.post(
					`${url}/heartbeat`,
					{
						serviceName: this._config.serviceName,
						instanceId: this._config.instanceId,
					},
					{
						headers: {
							"x-instance-token": token,
						},
					}
				)
			)
		);

		const failures = results.filter((result) => result.status === "rejected");
		if (failures.length === results.length) {
			throw new AppError(
				"Failed to refresh service TTL",
				ErrorCodes.ADDRESS_MANAGER_ERROR,
				{
					cause: normalizeError((failures[0] as PromiseRejectedResult).reason),
				}
			);
		}
	}

	async unregisterService(): Promise<void> {
		const token = this._tokenManager.getToken();
		const urls = this._config.discoveryUrls?.length
			? this._config.discoveryUrls
			: [this._config.addressManagerUrl];

		for (const url of urls) {
			try {
				await this._httpClient.post(
					`${url}/unregister`,
					{
						serviceName: this._config.serviceName,
						instanceId: this._config.instanceId,
					},
					{ headers: { "x-instance-token": token } }
				);
				return;
			} catch {
				// try next URL
			}
		}
	}

	private static _cachedLocalIP: string | null = null;

	hasIpChanged(): boolean {
		const nets = networkInterfaces();
		for (const name of Object.keys(nets)) {
			for (const net of nets[name] ?? []) {
				if (net.family === "IPv4" && !net.internal) {
					if (AddressManagerClient._cachedLocalIP === null) {
						AddressManagerClient._cachedLocalIP = net.address;
						return false;
					}
					return net.address !== AddressManagerClient._cachedLocalIP;
				}
			}
		}
		return false;
	}
}
