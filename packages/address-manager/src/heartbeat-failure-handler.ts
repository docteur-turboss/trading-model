import { logger } from "@trading-model/common/config/logger";
import { PositiveInt } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { ServiceClientDeps } from "./types";

const MAX_HEARTBEAT_FAILURES_BEFORE_RE_REGISTER = PositiveInt.of(3);

export class HeartbeatFailureHandler {
	private _consecutiveHeartbeatFailures = 0;

	constructor(private readonly _deps: ServiceClientDeps) {}

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
		await this._tryReRegistration(onSuccess);
	}

	private async _handleHeartbeatFailure(): Promise<void> {
		if (!this._deps.addressManagerClient.hasIpChanged()) {
			return;
		}
		logger.warn("Local IP changed, re-registering service");
		await this._tryReRegistration();
	}

	private async _tryReRegistration(onSuccess?: () => void): Promise<void> {
		try {
			const res = await this._deps.addressManagerClient.registerService();
			if (res?.token) {
				onSuccess?.();
				this._deps.tokenManager.setToken(res.token);
				this._deps.wsClient?.updateToken(res.token);
			}
		} catch (err) {
			logger.error("Re-registration failed", { error: normalizeError(err) });
		}
	}
}
