import {
	authenticationError,
	isAuthenticationError,
} from "@trading-model/common/utils/errors";
import { HTTP_HEADERS } from "@trading-model/contracts/http-headers";
import { RotatedTokenWire } from "@trading-model/contracts/wire/service-instance";
import type { HttpClient } from "@trading-model/http/http-client";
import { ServiceId, URLString } from "@trading-model/primitives/primitives";
import type { AddressManagerConfig } from "../config/address-manager-config";

/** Holds the registration token and refreshes it before it expires. */
export class TokenManager {
	private _token = "";
	/** Tail of the token operations queue (see `exclusive`). */
	private _lane: Promise<unknown> = Promise.resolve();

	constructor(
		private readonly _httpClient: HttpClient,
		private readonly _config: AddressManagerConfig
	) {}

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

	private async _rotate(): Promise<string> {
		const response = await this._httpClient.post(
			URLString.of(`${this._config.addressManagerUrl}/token/rotate`),
			{
				instanceId: this._config.identity.instanceId,
				serviceName: this._config.identity.serviceName,
			},
			{
				headers: this._token
					? { [HTTP_HEADERS.X_INSTANCE_TOKEN]: this._token }
					: {},
				serviceName: ServiceId.of("discovery-server"),
			},
			RotatedTokenWire
		);
		if (!response?.token) {
			throw authenticationError("Invalid token response from Address Manager");
		}
		return response.token;
	}

	refreshToken(): Promise<void> {
		return this.exclusive(async () => {
			try {
				this._token = await this._rotate();
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
