import type { HttpClient } from "@trading-model/common/config/http-client";
import {
	authenticationError,
	isAuthenticationError,
} from "@trading-model/common/utils/errors";
import { TokenRefreshClient } from "../../adapters/outbound/client/token-refresh-client";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";

export class TokenManager {
	private _token = "";
	private readonly _refreshClient: TokenRefreshClient;

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: AddressManagerConfig
	) {
		this._refreshClient = new TokenRefreshClient(
			this._httpClient,
			this._config
		);
	}

	getToken(): string {
		if (!this._token) {
			throw authenticationError(
				"Token is not available. Did you call refreshToken()?"
			);
		}

		return this._token;
	}

	setToken(token: string): void {
		this._token = token;
	}

	getTokenOrUndefined(): string | undefined {
		return this._token || undefined;
	}

	clearToken(): void {
		this._token = "";
	}

	async refreshToken(): Promise<void> {
		try {
			this._token = await this._refreshClient.doRefresh(this._token);
		} catch (err) {
			if (isAuthenticationError(err)) {
				throw err;
			}
			throw authenticationError("Failed to refresh authentication token", {
				cause: err,
			});
		}
	}
}
