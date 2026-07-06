import { logger } from "@trading-model/common/config/logger";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import { HeartbeatFailureHandler } from "./heartbeat-failure-handler";
import type { AddressManagerDeps } from "./types";

const MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = 3;

export class HeartbeatManager {
	private _addressManagerClient: AddressManagerClient;
	private _tokenManager: TokenManager;
	private _wsClient?: WebSocketClient;
	private _onSuccess?: () => void;
	private _onFailure?: () => void;
	private _consecutiveHeartbeatFailures = 0;
	private readonly _failureHandler: HeartbeatFailureHandler;

	constructor(deps: AddressManagerDeps) {
		this._addressManagerClient = deps.addressManagerClient;
		this._tokenManager = deps.tokenManager;
		this._wsClient = deps.wsClient;
		this._onSuccess = deps.onSuccess;
		this._onFailure = deps.onFailure;
		this._failureHandler = new HeartbeatFailureHandler(deps);
	}

	async sendHeartbeat(identity: ServiceIdentity): Promise<void> {
		if (this._heartbeatViaWs(identity)) {
			return;
		}
		await this._heartbeatViaHttp();
	}

	private _heartbeatViaWs(identity: ServiceIdentity): boolean {
		if (this._wsClient?.isConnected) {
			const sent = this._wsClient.sendHeartbeat(identity);
			if (sent) {
				this._onSuccess?.();
				this._consecutiveHeartbeatFailures = 0;
				return true;
			}
		}
		return false;
	}

	private async _handleSuccessfulHeartbeat(): Promise<void> {
		this._onSuccess?.();
		this._consecutiveHeartbeatFailures = 0;
	}

	private async _handleHeartbeatError(err: unknown): Promise<void> {
		this._onFailure?.();
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
			await this._failureHandler.handleError(
				err,
				this._onSuccess,
				this._onFailure
			);
		}
		await this._heartbeatViaHttpAfterFailure();
	}

	private async _heartbeatViaHttp(): Promise<void> {
		try {
			await this._addressManagerClient.refreshTTL();
			await this._handleSuccessfulHeartbeat();
		} catch (err) {
			await this._handleHeartbeatError(err);
		}
	}

	private async _heartbeatViaHttpAfterFailure(): Promise<void> {
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
