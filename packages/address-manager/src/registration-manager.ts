import { logger } from "@trading-model/common/config/logger";
import {
	AppError,
	addressManagerError,
	normalizeError,
} from "@trading-model/common/utils/errors";
import type { AddressManagerClient } from "./client/address-manager-client";
import type { TokenManager } from "./client/token-manager";
import type { WebSocketClient } from "./client/websocket-client";
import type { AddressManagerDeps } from "./types";
import { RetryScheduler } from "./retry-scheduler";

const RETRY_CONFIG = {
	maxRetries: 10,
	baseDelayMs: 1000,
	maxDelayMs: 30_000,
	backgroundIntervalMs: 30_000,
};

export class RegistrationManager {
	private _addressManagerClient: AddressManagerClient;
	private _tokenManager: TokenManager;
	private _wsClient?: WebSocketClient;
	private _onSuccess?: () => void;
	private _onFailure?: () => void;
	private _retryScheduler: RetryScheduler;

	constructor(deps: AddressManagerDeps) {
		this._addressManagerClient = deps.addressManagerClient;
		this._tokenManager = deps.tokenManager;
		this._wsClient = deps.wsClient;
		this._onSuccess = deps.onSuccess;
		this._onFailure = deps.onFailure;
		this._retryScheduler = new RetryScheduler(RETRY_CONFIG);
	}

	get shouldRetryRegistration(): boolean {
		return this._retryScheduler.shouldRetry;
	}

	set shouldRetryRegistration(value: boolean) {
		this._retryScheduler.shouldRetry = value;
	}

	resolveStopRegistration(): void {
		this._retryScheduler.resolveStop();
	}

	createStopPromise(): Promise<void> {
		return this._retryScheduler.createStopPromise();
	}

	async tryStickyRegistration(): Promise<void> {
		const existingToken = this._tokenManager.getTokenOrNull();
		if (!existingToken) {
			return this._retryScheduler.retryLoop(
				(attempt) => this._tryRegister(attempt),
				() => this._backgroundRetryRegistration(),
			);
		}
		logger.info(
			"Sticky registration: found existing token, attempting heartbeat to validate",
		);
		try {
			await this._addressManagerClient.refreshTTL();
			logger.info(
				"Sticky registration: heartbeat succeeded with existing token, registration valid",
			);
		} catch {
			logger.warn(
				"Sticky registration: heartbeat with existing token failed, re-registering",
			);
			return this._retryScheduler.retryLoop(
				(attempt) => this._tryRegister(attempt),
				() => this._backgroundRetryRegistration(),
			);
		}
	}

	private async _handleRegistrationSuccess(res: { token: string }): Promise<void> {
		this._onSuccess?.();
		this._tokenManager.setToken(res.token);
		this._wsClient?.updateToken(res.token);
	}

	private async _tryRegister(attempt: number): Promise<boolean> {
		try {
			const res = await this._addressManagerClient.registerService();
			if (!res?.token) {
				throw new Error("Registration response missing token");
			}
			await this._handleRegistrationSuccess(res);
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
						setTimeout(resolve, this._retryScheduler.computeJitteredDelay(attempt)),
					),
					this._retryScheduler.createStopWait(),
				]);
			}
			return false;
		}
	}

	private _backgroundRetryRegistration(): Promise<void> {
		return this._retryScheduler.backgroundRetryLoop(
			(attempt) => this._tryBackgroundRegister(attempt),
			() => {
				throw addressManagerError(
					"Service registration failed — service stopped during background retry",
				);
			},
		);
	}

	private async _tryBackgroundRegister(attempt: number): Promise<boolean> {
		try {
			const res = await this._addressManagerClient.registerService();
			if (!res?.token) {
				throw new Error("Registration response missing token");
			}
			await this._handleRegistrationSuccess(res);
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
}
