import { DurationMs } from "@trading-model/common/domain/primitives";
import {
	type BackoffConfig,
	computeExponentialBackoffWithJitter,
} from "@trading-model/common/utils/backoff-config";
import {
	retryWithBackoff as commonRetryWithBackoff,
	type RetryOptions,
	type RetryResult,
} from "@trading-model/common/utils/retry";

export interface RetryConfig extends BackoffConfig {
	maxRetries: number;
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
		return computeExponentialBackoffWithJitter(attempt, {
			baseDelayMs: this._config.baseDelayMs,
			maxDelayMs: this._config.maxDelayMs,
			jitterMs: DurationMs.of(1000),
		});
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

	retryWithBackoff<TResult>(
		fn: () => Promise<TResult>,
		options?: Partial<RetryOptions>
	): Promise<RetryResult<TResult>> {
		return commonRetryWithBackoff(fn, {
			maxRetries: options?.maxRetries ?? this._config.maxRetries,
			baseDelayMs: options?.baseDelayMs ?? this._config.baseDelayMs,
			maxDelayMs: options?.maxDelayMs ?? this._config.maxDelayMs,
			jitterMs: DurationMs.of(1000),
			shouldRetry: () => this._shouldRetry,
		});
	}
}
