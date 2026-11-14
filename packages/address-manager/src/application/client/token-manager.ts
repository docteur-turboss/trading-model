import {
	authenticationError,
	isAuthenticationError,
} from "@trading-model/common/utils/errors";
import type { HttpClient } from "@trading-model/http/adapters/outbound/http-client";
import { TokenRefreshClient } from "../../adapters/outbound/client/token-refresh-client";
import type { AddressManagerConfig } from "../../domain/config/address-manager-config";

/** Holds the registration token and refreshes it before it expires. */
export class TokenManager {
	private _token = "";
	private readonly _refreshClient: TokenRefreshClient;
	/** Tail of the token operations queue (see `exclusive`). */
	private _lane: Promise<unknown> = Promise.resolve();

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

	/**
	 * Runs `operation` once every token use or rotation queued before it has
	 * settled. Discovery drops the old token as soon as it issues the new one:
	 * a heartbeat racing a rotation (both timers fire together every minute)
	 * would otherwise be sent with the old token and rejected.
	 */
	exclusive<TResult>(operation: () => Promise<TResult>): Promise<TResult> {
		const run = this._lane.then(operation, operation);
		// biome-ignore lint/plugin: the caller receives `run` and handles its error; the lane only orders the next operation.
		this._lane = run.catch(() => undefined);
		return run;
	}

	refreshToken(): Promise<void> {
		return this.exclusive(async () => {
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
		});
	}
}
