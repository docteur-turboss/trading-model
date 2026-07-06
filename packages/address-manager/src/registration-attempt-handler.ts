import { logger } from "@trading-model/common/config/logger";
import { normalizeError } from "@trading-model/common/utils/errors";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import { RetryScheduler } from "./retry-scheduler";

const RETRY_CONFIG = {
	maxRetries: 10,
	baseDelayMs: 1000,
	maxDelayMs: 30_000,
	backgroundIntervalMs: 30_000,
};

export class RegistrationAttemptHandler {
	private readonly _retryScheduler = new RetryScheduler(RETRY_CONFIG);

	constructor(
		private readonly _addressManagerClient: AddressManagerClient,
		private readonly _tokenManager: TokenManager,
		private readonly _wsClient?: WebSocketClient,
		private readonly _onSuccess?: () => void,
		private readonly _onFailure?: () => void
	) {}

	get shouldRetry(): boolean {
		return this._retryScheduler.shouldRetry;
	}

	set shouldRetry(value: boolean) {
		this._retryScheduler.shouldRetry = value;
	}

	async tryRegister(attempt: number): Promise<boolean> {
		try {
			const res = await this._addressManagerClient.registerService();
			if (!res?.token) {
				throw new Error("Registration response missing token");
			}
			await this._handleSuccess(res);
			return true;
		} catch (error) {
			this._onFailure?.();
			logger.error("Service registration failed", {
				attempt,
				maxRetries: RETRY_CONFIG.maxRetries,
				error: normalizeError(error),
			});
			if (attempt < RETRY_CONFIG.maxRetries) {
				await Promise.race([
					new Promise<void>((resolve) =>
						setTimeout(
							resolve,
							this._retryScheduler.computeJitteredDelay(attempt)
						)
					),
					this._retryScheduler.createStopWait(),
				]);
			}
			return false;
		}
	}

	async tryBackgroundRegister(attempt: number): Promise<boolean> {
		try {
			const res = await this._addressManagerClient.registerService();
			if (!res?.token) {
				throw new Error("Registration response missing token");
			}
			await this._handleSuccess(res);
			logger.info("Service re-registered successfully during background retry");
			return true;
		} catch (error) {
			this._onFailure?.();
			logger.error("Background registration retry failed", {
				error: normalizeError(error),
				attempt,
			});
			return false;
		}
	}

	private async _handleSuccess(res: { token: string }): Promise<void> {
		this._onSuccess?.();
		this._tokenManager.setToken(res.token);
		this._wsClient?.updateToken(res.token);
	}
}
