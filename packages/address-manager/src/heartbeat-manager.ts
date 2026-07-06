import { logger } from "@trading-model/common/config/logger";
import type { ServiceIdentity } from "@trading-model/common/domain/service-identity";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { AddressManagerDeps } from "./types";

const MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = 3;

export class HeartbeatManager {
	private _addressManagerClient: AddressManagerClient;
	private _tokenManager: TokenManager;
	private _wsClient?: WebSocketClient;
	private _onSuccess?: () => void;
	private _onFailure?: () => void;
	private _consecutiveHeartbeatFailures = 0;

	constructor(deps: AddressManagerDeps) {
		this._addressManagerClient = deps.addressManagerClient;
		this._tokenManager = deps.tokenManager;
		this._wsClient = deps.wsClient;
		this._onSuccess = deps.onSuccess;
		this._onFailure = deps.onFailure;
	}

	async performHeartbeat({
		serviceName,
		instanceId,
	}: ServiceIdentity): Promise<void> {
		if (this._heartbeatViaWs({ serviceName, instanceId })) {
			return;
		}
		await this._heartbeatViaHttp();
	}

	private _heartbeatViaWs({
		serviceName,
		instanceId,
	}: ServiceIdentity): boolean {
		if (this._wsClient?.isConnected()) {
			const sent = this._wsClient.sendHeartbeat(
				serviceName,
				instanceId
			);
			if (sent) {
				this._onSuccess?.();
				this._consecutiveHeartbeatFailures = 0;
				return true;
			}
		}
		return false;
	}

	private async _heartbeatViaHttp(): Promise<void> {
		try {
			await this._addressManagerClient.refreshTTL();
			this._onSuccess?.();
			this._consecutiveHeartbeatFailures = 0;
			return;
		} catch (err) {
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
				logger.warn(
					"Too many heartbeat failures — forcing re-registration"
				);
				this._consecutiveHeartbeatFailures = 0;
				try {
					const res =
						await this._addressManagerClient.registerService();
					if (res?.token) {
						this._onSuccess?.();
						this._tokenManager.setToken(res.token);
						this._wsClient?.updateToken(res.token);
						return;
					}
				} catch (registerErr) {
					logger.error(
						"Re-registration after heartbeat failures failed",
						{
							error: normalizeError(registerErr),
						}
					);
				}
			}
		}

		await this._handleHeartbeatFailure();
	}

	private async _handleHeartbeatFailure(): Promise<void> {
		if (this._addressManagerClient.hasIpChanged()) {
			logger.warn("Local IP changed, re-registering service");
			try {
				const res =
					await this._addressManagerClient.registerService();
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
}
