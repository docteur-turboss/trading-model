import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";

const MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = 3;

export class HeartbeatFailureHandler {
	private _consecutiveHeartbeatFailures = 0;

	constructor(
		private readonly _addressManagerClient: AddressManagerClient,
		private readonly _tokenManager: TokenManager,
		private readonly _wsClient?: WebSocketClient
	) {}

	async handleError(
		err: unknown,
		onSuccess?: () => void,
		onFailure?: () => void
	): Promise<void> {
		onFailure?.();
		this._consecutiveHeartbeatFailures++;
		logger.error("Heartbeat failed", {
			consecutiveFailures: this._consecutiveHeartbeatFailures,
			error: normalizeError(err),
		});
		if (
			this._consecutiveHeartbeatFailures >=
			MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER
		) {
			this._consecutiveHeartbeatFailures = 0;
			await this._forceReRegistration(onSuccess);
		}
		await this._handleHeartbeatFailure();
	}

	resetFailures(): void {
		this._consecutiveHeartbeatFailures = 0;
	}

	private async _forceReRegistration(onSuccess?: () => void): Promise<void> {
		logger.warn("Too many heartbeat failures — forcing re-registration");
		try {
			const res = await this._addressManagerClient.registerService();
			if (res?.token) {
				onSuccess?.();
				this._tokenManager.setToken(res.token);
				this._wsClient?.updateToken(res.token);
			}
		} catch (registerErr) {
			logger.error("Re-registration after heartbeat failures failed", {
				error: normalizeError(registerErr),
			});
		}
	}

	private async _handleHeartbeatFailure(): Promise<void> {
		if (!this._addressManagerClient.hasIpChanged()) {
			return;
		}
		logger.warn("Local IP changed, re-registering service");
		try {
			const res = await this._addressManagerClient.registerService();
			if (res) {
				this._tokenManager.setToken(res.token);
				this._wsClient?.updateToken(res.token);
			}
		} catch (err) {
			logger.error("Re-registration after IP change failed", {
				error: normalizeError(err),
			});
		}
	}
}
