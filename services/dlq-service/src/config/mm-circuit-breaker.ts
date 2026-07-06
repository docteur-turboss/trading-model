import { logger } from "./logger";

export interface CircuitBreakerConfig {
	failureThreshold: number;
	resetMs: number;
	halfOpenMaxAttempts: number;
	name: string;
}

export class MessageManagerCircuitBreaker {
	private _failures = 0;
	private _openUntil = 0;
	private _halfOpenAttempts = 0;
	private readonly _config: CircuitBreakerConfig;

	constructor(config?: Partial<CircuitBreakerConfig>) {
		this._config = {
			failureThreshold: 5,
			resetMs: 30_000,
			halfOpenMaxAttempts: 2,
			name: "message-manager",
			...config,
		};
	}

	isOpen(): boolean {
		if (this._openUntil > Date.now()) {
			return true;
		}
		if (this._openUntil > 0) {
			this._failures = 0;
			this._openUntil = 0;
			this._halfOpenAttempts = 0;
		}
		return false;
	}

	recordResult(success: boolean): void {
		if (success) {
			if (this._failures > 0) {
				this._failures = 0;
			}
			this._openUntil = 0;
			this._halfOpenAttempts = 0;
		} else {
			this._failures++;
			if (this._openUntil > 0) {
				this._halfOpenAttempts++;
				if (this._halfOpenAttempts >= this._config.halfOpenMaxAttempts) {
					this._openUntil = Date.now() + this._config.resetMs;
					logger.warn(
						`${this._config.name} circuit breaker re-opened during half-open`,
						{
							failures: this._failures,
							halfOpenAttempts: this._halfOpenAttempts,
							resetMs: this._config.resetMs,
						}
					);
				}
			}
			if (this._failures >= this._config.failureThreshold) {
				this._openUntil = Date.now() + this._config.resetMs;
				logger.warn(`${this._config.name} circuit breaker opened`, {
					failures: this._failures,
					resetMs: this._config.resetMs,
				});
			}
		}
	}

	reset(): void {
		this._failures = 0;
		this._openUntil = 0;
		this._halfOpenAttempts = 0;
	}
}
