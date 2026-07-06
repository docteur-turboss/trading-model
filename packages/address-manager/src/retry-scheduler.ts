import { logger } from "@trading-model/common/config/logger";
import { computeExponentialBackoff } from "@trading-model/common/utils/backoff-config";
import {
	retryWithBackoff as commonRetryWithBackoff,
	type RetryOptions,
	type RetryResult,
} from "@trading-model/common/utils/retry";
import { sleep } from "@trading-model/common/utils/sleep";

export interface RetryConfig {
	maxRetries: number;
	baseDelayMs: number;
	maxDelayMs: number;
	backgroundIntervalMs: number;
}

export class RetryScheduler {
	private _shouldRetry = true;

	constructor(private readonly _config: RetryConfig) {}

	get shouldRetry(): boolean {
		return this._shouldRetry;
	}

	set shouldRetry(value: boolean) {
		this._shouldRetry = value;
	}

	computeJitteredDelay(attempt: number): number {
		return (
			computeExponentialBackoff(attempt, {
				baseDelayMs: this._config.baseDelayMs,
				maxDelayMs: this._config.maxDelayMs,
			}) +
			Math.random() * 1000
		);
	}

	createStopWait(): Promise<void> {
		return new Promise<void>((resolve) => {
			const check = () => {
				if (this._shouldRetry) {
					setImmediate(check);
				} else {
					resolve();
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
		onExhausted: () => Promise<void>
	): Promise<void> {
		for (let attempt = 1; attempt <= this._config.maxRetries; attempt++) {
			if (!this._shouldRetry) {
				return;
			}
			if (await attemptFn(attempt)) {
				return;
			}
		}
		logger.warn("Max retries exhausted — entering background retry mode");
		return onExhausted();
	}

	async backgroundRetryLoop(
		attemptFn: (attempt: number) => Promise<boolean>,
		onStopped: () => never
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

	async retryWithBackoff<T>(
		fn: () => Promise<T>,
		options?: Partial<RetryOptions>
	): Promise<RetryResult<T>> {
		return commonRetryWithBackoff(fn, {
			maxRetries: options?.maxRetries ?? this._config.maxRetries,
			baseDelayMs: options?.baseDelayMs ?? this._config.baseDelayMs,
			maxDelayMs: options?.maxDelayMs ?? this._config.maxDelayMs,
			jitterMs: 1000,
			shouldRetry: () => this._shouldRetry,
		});
	}
}
