import type { HttpClient } from "@trading-model/common/config/http-client";
import { AppError, AuthenticationError } from "@trading-model/common/utils/errors";

import type { AddressManagerConfig } from "../config/address-manager-config";

/**
 * TokenManager
 *
 * Responsibilities:
 * - Store the authentication token in memory
 * - Securely refresh the token when needed
 * - Expose the current token to the system
 *
 * Encapsulates all token management details. The rest of the system does NOT know:
 * - How the token is obtained
 * - When it expires
 * - How it is renewed
 */
export class TokenManager {
	private _token: string | null;

	/**
	 * Initializes a new TokenManager.
	 *
	 * @param httpClient - HTTP client used to request token rotations.
	 * @param config - Configuration for the Address Manager client.
	 *
	 * @example
	 * ```ts
	 * const manager = new TokenManager(httpClient, config);
	 * await manager.refreshToken();
	 * const token = manager.getToken();
	 * ```
	 */
	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: AddressManagerConfig
	) {
		this._token = null;
	}

	/**
	 * Returns the current authentication token.
	 *
	 * @throws AuthenticationError if the token is not available.
	 * @returns string - The current token.
	 *
	 * @example
	 * ```ts
	 * const token = tokenManager.getToken();
	 * ```
	 */
	getToken(): string {
		if (!this._token) {
			throw new AuthenticationError("Token is not available. Did you call refreshToken()?");
		}

		return this._token;
	}

	setToken(token: string): void {
		this._token = token;
	}

	getTokenOrNull(): string | null {
		return this._token;
	}

	/** Explicitly clear the stored token from memory. */
	clearToken(): void {
		this._token = null;
	}

	/**
	 * Refreshes the authentication token from the Address Manager.
	 *
	 * Behavior:
	 * - Atomically replaces the token in memory
	 * - Does NOT perform retries
	 * - Timing and scheduling of refresh is managed externally (e.g., via scheduler)
	 *
	 * @throws AuthenticationError if the token cannot be obtained or response is invalid.
	 *
	 * @example
	 * ```ts
	 * await tokenManager.refreshToken();
	 * const token = tokenManager.getToken();
	 * ```
	 */
	private _buildAuthHeaders(): Record<string, string> {
		const headers: Record<string, string> = {};
		if (this._token) {
			headers["x-instance-token"] = this._token;
		}
		return headers;
	}

	private _buildTokenPayload(): { instanceId: string; serviceName: string } {
		return {
			instanceId: this._config.identity.instanceId,
			serviceName: this._config.identity.serviceName,
		};
	}

	async refreshToken(): Promise<void> {
		try {
			await this._doRefreshToken();
		} catch (err) {
			if (err instanceof AuthenticationError) {
				throw err;
			}
			throw new AuthenticationError(
				"Failed to refresh authentication token",
				{ cause: err },
			);
		}
	}

	private async _doRefreshToken(): Promise<void> {
		const response = await this._httpClient.post<{ token: string }>(
			`${this._config.addressManagerUrl}/token/rotate`,
			this._buildTokenPayload(),
			{ headers: this._buildAuthHeaders() },
		);
		if (!response?.token) {
			throw new AuthenticationError(
				"Invalid token response from Address Manager",
			);
		}
		this._token = response.token;
	}
}
