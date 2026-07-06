import { logger } from "@trading-model/common/config/logger";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import { normalizeError } from "@trading-model/common/utils/errors";
import { sleep } from "@trading-model/common/utils/sleep";

export interface RetryConfig {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	backgroundIntervalMs: number;
}

interface PendingStop {
	resolve: () => void;
}

export class RetryScheduler {
	private _shouldRetry = true;
	private _pendingStop: PendingStop | null = null;

	constructor(private readonly _config: RetryConfig) {}

	get shouldRetry(): boolean {
		return this._shouldRetry;
	}

	set shouldRetry(value: boolean) {
		this._shouldRetry = value;
	}

	resolveStop(): void {
		if (this._pendingStop) {
			const resolve = this._pendingStop.resolve;
			this._pendingStop = null;
			resolve();
		}
	}

	createStopPromise(): Promise<void> {
		return new Promise<void>((resolve) => {
			this._pendingStop = { resolve };
		});
	}

	computeJitteredDelay(attempt: number): number {
		return computeExponentialBackoff(attempt, { baseDelayMs: this._config.baseDelayMs, maxDelayMs: this._config.maxDelayMs }) + Math.random() * 1000;
	}

	createStopWait(): Promise<void> {
		return new Promise<void>((resolve) => {
			const check = () => {
				if (!this._shouldRetry) {
					resolve();
				} else {
					setImmediate(check);
				}
			};
			setImmediate(check);
		});
	}

	async waitForBackgroundRetry(): Promise<void> {
		const jitteredInterval =
			this._config.backgroundIntervalMs + Math.random() * 5000;
		await Promise.race([sleep(jitteredInterval), this.createStopWait()]);
		await new Promise<void>((resolve) => setImmediate(resolve));
	}

	async retryLoop(
		attemptFn: (attempt: number) => Promise<boolean>,
		onExhausted: () => Promise<void>,
	): Promise<void> {
		for (let attempt = 1; attempt <= this._config.maxRetries; attempt++) {
			if (!this._shouldRetry) {
				return;
			}
			if (await attemptFn(attempt)) {
				return;
			}
		}
		logger.warn(
			"Max retries exhausted — entering background retry mode",
		);
		return onExhausted();
	}

	async backgroundRetryLoop(
		attemptFn: (attempt: number) => Promise<boolean>,
		onStopped: () => never,
	): Promise<void> {
		let backgroundAttempts = 0;
		while (this._shouldRetry) {
			backgroundAttempts++;
			if (await attemptFn(backgroundAttempts)) {
				return;
			}
			await this.waitForBackgroundRetry();
		}
		return onStopped();
	}
}
