import { logger } from "@trading-model/common/config/logger";
import { DurationMs } from "@trading-model/common/domain/primitives";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";
import { RetryScheduler } from "./retry-scheduler";
import type { ServiceClientDeps } from "./types";

const RETRY_CONFIG = {
	maxRetries: 10,
	baseDelayMs: DurationMs.of(1000),
	maxDelayMs: DurationMs.of(30_000),
};

export class RegistrationAttemptHandler {
	private readonly _retryScheduler = new RetryScheduler(RETRY_CONFIG);

	constructor(private readonly _deps: ServiceClientDeps) {}

	get shouldRetry(): boolean {
		return this._retryScheduler.shouldRetry;
	}

	set shouldRetry(value: boolean) {
		this._retryScheduler.shouldRetry = value;
	}

	get shouldRetryRegistration(): boolean {
		return this.shouldRetry;
	}

	set shouldRetryRegistration(value: boolean) {
		this.shouldRetry = value;
	}

	stopRetrying(): void {
		this.shouldRetry = false;
	}

	async tryStickyRegistration(): Promise<void> {
		let attempt = 1;
		while (attempt <= RETRY_CONFIG.maxRetries && this.shouldRetry) {
			if (await this.tryRegister(attempt)) {
				return;
			}
			attempt++;
		}
		logger.error("Service registration failed after max retries", {
			maxRetries: RETRY_CONFIG.maxRetries,
		});
	}

	async tryRegister(attempt: number): Promise<boolean> {
		try {
			await this._doRegister(attempt);
			return true;
		} catch (error) {
			return this._handleRegisterError(error, attempt);
		}
	}

	async tryBackgroundRegister(attempt: number): Promise<boolean> {
		try {
			await this._doRegister(attempt);
			logger.info("Service re-registered successfully during background retry");
			return true;
		} catch (error) {
			this._deps.onFailure?.();
			logger.error("Background registration retry failed", {
				error: normalizeError(error),
				attempt,
			});
			return false;
		}
	}

	private async _doRegister(_attempt: number): Promise<void> {
		const res = await this._deps.addressManagerClient.registerService();
		if (!res?.token) {
			throw new Error("Registration response missing token");
		}
		this._handleSuccess(res);
	}

	private async _handleRegisterError(
		error: unknown,
		attempt: number
	): Promise<boolean> {
		this._deps.onFailure?.();
		logger.error("Service registration failed", {
			attempt,
			maxRetries: RETRY_CONFIG.maxRetries,
			error: normalizeError(error),
		});
		if (attempt < RETRY_CONFIG.maxRetries) {
			await this._waitWithJitteredDelay(attempt);
		}
		return false;
	}

	private async _waitWithJitteredDelay(attempt: number): Promise<void> {
		await Promise.race([
			sleep(this._retryScheduler.computeJitteredDelay(attempt)),
			this._retryScheduler.createStopWait(),
		]);
	}

	private _handleSuccess(res: { token: string }): void {
		this._deps.onSuccess?.();
		this._deps.tokenManager.setToken(res.token);
		this._deps.wsClient?.updateToken(res.token);
	}

	start(): { stop: () => void } {
		void this.tryStickyRegistration();
		return {
			stop: () => {
				this.shouldRetry = false;
			},
		};
	}
}
