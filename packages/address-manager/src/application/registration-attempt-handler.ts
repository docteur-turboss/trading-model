import { computeExponentialBackoffWithJitter } from "@trading-model/common/utils/backoff-config";
import { normalizeError } from "@trading-model/common/utils/errors";
import { logger } from "@trading-model/http/infrastructure/logger";
import { DurationMs } from "@trading-model/primitives/primitives";
import type { ServiceClientDeps } from "./types";

const RETRY_CONFIG = {
	maxRetries: 10,
	baseDelayMs: DurationMs.of(1000),
	maxDelayMs: DurationMs.of(30_000),
	jitterMs: DurationMs.of(1000),
};

export class RegistrationAttemptHandler {
	private _stopped = false;
	/** Ends the current backoff wait early; set only while waiting. */
	private _wakeUp: (() => void) | null = null;

	constructor(private readonly _deps: ServiceClientDeps) {}

	stopRetrying(): void {
		this._stopped = true;
		this._wakeUp?.();
	}

	async tryStickyRegistration(): Promise<void> {
		for (
			let attempt = 1;
			attempt <= RETRY_CONFIG.maxRetries && !this._stopped;
			attempt++
		) {
			if (await this._tryRegister(attempt)) {
				return;
			}
		}
		logger.error("Service registration failed after max retries", {
			maxRetries: RETRY_CONFIG.maxRetries,
		});
	}

	private async _tryRegister(attempt: number): Promise<boolean> {
		try {
			const res = await this._deps.addressManagerClient.registerService();
			if (!res?.token) {
				throw new Error("Registration response missing token");
			}
			this._deps.onSuccess?.();
			this._deps.tokenManager.setToken(res.token);
			return true;
		} catch (error) {
			this._deps.onFailure?.();
			logger.error("Service registration failed", {
				attempt,
				maxRetries: RETRY_CONFIG.maxRetries,
				error: normalizeError(error),
			});
			if (attempt < RETRY_CONFIG.maxRetries && !this._stopped) {
				await this._wait(
					computeExponentialBackoffWithJitter(attempt, RETRY_CONFIG)
				);
			}
			return false;
		}
	}

	private _wait(ms: number): Promise<void> {
		return new Promise<void>((resolve) => {
			const timer = setTimeout(() => this._wakeUp?.(), ms);
			timer.unref();
			this._wakeUp = () => {
				clearTimeout(timer);
				this._wakeUp = null;
				resolve();
			};
		});
	}
}
