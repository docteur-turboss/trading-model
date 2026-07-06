import { logger } from "@trading-model/common/config/logger";
import {
	AppError,
	ErrorCodes,
	normalizeError,
} from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import type { AddressManagerDeps } from "./types";

const MAX_REGISTRATION_RETRIES = 10;
const REGISTRATION_BASE_DELAY_MS = 1000;
const REGISTRATION_MAX_DELAY_MS = 30_000;
const REGISTRATION_BACKGROUND_RETRY_INTERVAL_MS = 30_000;

export class RegistrationManager {
	private _addressManagerClient: AddressManagerClient;
	private _tokenManager: TokenManager;
	private _wsClient?: WebSocketClient;
	private _onSuccess?: () => void;
	private _onFailure?: () => void;
	private _shouldRetryRegistration = true;
	private _resolveStopRegistration: (() => void) | null = null;

	constructor(deps: AddressManagerDeps) {
		this._addressManagerClient = deps.addressManagerClient;
		this._tokenManager = deps.tokenManager;
		this._wsClient = deps.wsClient;
		this._onSuccess = deps.onSuccess;
		this._onFailure = deps.onFailure;
	}

	get shouldRetryRegistration(): boolean {
		return this._shouldRetryRegistration;
	}

	set shouldRetryRegistration(value: boolean) {
		this._shouldRetryRegistration = value;
	}

	resolveStopRegistration(): void {
		this._resolveStopRegistration?.();
	}

	createStopPromise(): Promise<void> {
		return new Promise<void>((resolve) => {
			this._resolveStopRegistration = resolve;
		});
	}

	async tryStickyRegistration(): Promise<void> {
		const existingToken = this._tokenManager.getTokenOrNull();
		if (existingToken) {
			logger.info(
				"Sticky registration: found existing token, attempting heartbeat to validate"
			);
			try {
				await this._addressManagerClient.refreshTTL();
				logger.info(
					"Sticky registration: heartbeat succeeded with existing token, registration valid"
				);
				return;
			} catch {
				logger.warn(
					"Sticky registration: heartbeat with existing token failed, re-registering"
				);
			}
		}
		return this._retryRegistration();
	}

	private async _retryRegistration(): Promise<void> {
		for (let attempt = 1; attempt <= MAX_REGISTRATION_RETRIES; attempt++) {
			if (!this._shouldRetryRegistration) {
				return;
			}

			try {
				const res = await this._addressManagerClient.registerService();
				if (!res?.token) {
					throw new Error("Registration response missing token");
				}
				this._onSuccess?.();
				this._tokenManager.setToken(res.token);
				this._wsClient?.updateToken(res.token);
				return;
			} catch (error) {
				this._onFailure?.();
				logger.error("Service registration failed", {
					attempt,
					maxRetries: MAX_REGISTRATION_RETRIES,
					error: normalizeError(error),
				});

				if (attempt < MAX_REGISTRATION_RETRIES) {
					const baseDelay = Math.min(
						REGISTRATION_BASE_DELAY_MS * 2 ** attempt,
						REGISTRATION_MAX_DELAY_MS
					);
					const jitter = Math.random() * 1000;
					await Promise.race([
						sleep(baseDelay + jitter),
						this._createStopWait(),
					]);
					if (!this._shouldRetryRegistration) {
						return;
					}
				}
			}
		}

		logger.warn(
			"Max registration retries exhausted — entering background retry mode"
		);
		return this._backgroundRetryRegistration();
	}

	private _createStopWait(): Promise<void> {
		return new Promise<void>((resolve) => {
			const check = () => {
				if (!this._shouldRetryRegistration) {
					resolve();
				} else {
					setImmediate(check);
				}
			};
			setImmediate(check);
		});
	}

	private async _backgroundRetryRegistration(): Promise<void> {
		let backgroundAttempts = 0;

		while (this._shouldRetryRegistration) {
			backgroundAttempts++;

			try {
				const res = await this._addressManagerClient.registerService();
				if (!res?.token) {
					throw new Error("Registration response missing token");
				}
				this._onSuccess?.();
				this._tokenManager.setToken(res.token);
				this._wsClient?.updateToken(res.token);
				logger.info(
					"Service re-registered successfully during background retry"
				);
				return;
			} catch (error) {
				this._onFailure?.();
				logger.error("Background registration retry failed", {
					error: normalizeError(error),
					attempt: backgroundAttempts,
				});
			}

			const jitteredInterval =
				REGISTRATION_BACKGROUND_RETRY_INTERVAL_MS + Math.random() * 5000;
			await Promise.race([sleep(jitteredInterval), this._createStopWait()]);

			await new Promise<void>((resolve) => setImmediate(resolve));
		}

		throw new AppError(
			"Service registration failed — service stopped during background retry",
			ErrorCodes.ADDRESS_MANAGER_ERROR
		);
	}
}
