import { networkInterfaces } from "node:os";
import type { HttpClient } from "@trading-model/common/config/http-client";
import {
	AppError,
	AddressManagerError,
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

	private _buildRegistrationPayload(): RegisterServicePayload {
		return {
			serviceName: this._config.identity.serviceName,
			port: this._config.servicePort,
			ip: AddressManagerClient._getLocalIP(),
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
		urls: string[],
	): Promise<ServiceRegistrationResponse | undefined> {
		let lastError: unknown;
		for (const url of urls) {
			try {
				return await this._httpClient.post<ServiceRegistrationResponse>(
					`${url}/register`,
					payload,
				);
			} catch (error) {
				lastError = error;
			}
		}
		throw new AddressManagerError(
			"Failed to register service to Address Manager",
			{ cause: normalizeError(lastError) },
		);
	}

	private _buildHeartbeatPayload(): {
		serviceName: string;
		instanceId: string;
	} {
		return {
			serviceName: this._config.identity.serviceName,
			instanceId: this._config.identity.instanceId,
		};
	}

	private async _sendHeartbeat(url: string): Promise<void> {
		await this._httpClient.post(
			`${url}/heartbeat`,
			this._buildHeartbeatPayload(),
			{
				headers: {
					"x-instance-token": this._tokenManager.getToken(),
				},
			}
		);
	}

	async refreshTTL(): Promise<void> {
		const urls = this._getUrls();
		if (urls.length === 1) {
			return await this._refreshSingleUrl(urls[0]);
		}
		return await this._refreshMultipleUrls(urls);
	}

	private async _refreshSingleUrl(url: string): Promise<void> {
		try {
			await this._sendHeartbeat(url);
		} catch (error) {
			throw new AddressManagerError(
				"Failed to refresh service TTL",
				{ cause: normalizeError(error) },
			);
		}
	}

	private async _refreshMultipleUrls(urls: string[]): Promise<void> {
		const results = await Promise.allSettled(
			urls.map((url) => this._sendHeartbeat(url)),
		);
		const failures = results.filter(
			(result) => result.status === "rejected",
		);
		if (failures.length === results.length) {
			throw new AddressManagerError("Failed to refresh service TTL", {
				cause: normalizeError(
					(failures[0] as PromiseRejectedResult).reason,
				),
			});
		}
	}

	async unregisterService(): Promise<void> {
		const token = this._tokenManager.getToken();
		const urls = this._getUrls();
		await this._tryUnregisterUrls(token, urls);
	}

	private async _tryUnregisterUrls(
		token: string,
		urls: string[],
	): Promise<void> {
		for (const url of urls) {
			try {
				await this._httpClient.post(
					`${url}/unregister`,
					{
						serviceName: this._config.identity.serviceName,
						instanceId: this._config.identity.instanceId,
					},
					{ headers: { "x-instance-token": token } },
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
