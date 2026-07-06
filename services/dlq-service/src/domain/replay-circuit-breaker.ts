import { logger } from "@trading-model/common/config/logger";
import type { CircuitState } from "@trading-model/common/domain/circuit-state";

export interface ReplayCircuitBreakerConfig {
	circuitThreshold?: number;
	circuitCooldownMs?: number;
	halfOpenMaxAttempts?: number;
}

export class ReplayCircuitBreaker {
	private readonly _circuitThreshold: number;
	private readonly _circuitCooldownMs: number;
	private readonly _halfOpenMaxAttempts: number;
	private _circuitState: CircuitState = "closed";
	private _circuitFailures = 0;
	private _circuitOpenUntil = 0;
	private _halfOpenAttempts = 0;

	constructor(config: ReplayCircuitBreakerConfig = {}) {
		this._circuitThreshold = config.circuitThreshold ?? 5;
		this._circuitCooldownMs = config.circuitCooldownMs ?? 30_000;
		this._halfOpenMaxAttempts = config.halfOpenMaxAttempts ?? 2;
	}

	canProceed(): boolean {
		if (this._circuitOpenUntil > Date.now()) {
			return false;
		}
		if (this._circuitOpenUntil > 0) {
			this._circuitFailures = 0;
			this._circuitOpenUntil = 0;
			this._halfOpenAttempts = 0;
		}
		return true;
	}

	recordResult(success: boolean): void {
		if (success) {
			this._resetOnSuccess();
		} else {
			this._handleFailure();
		}
	}

	getCircuitState(): CircuitState {
		return this._circuitState;
	}

	private _resetOnSuccess(): void {
		if (this._circuitFailures > 0) {
			this._circuitFailures = 0;
		}
		this._circuitOpenUntil = 0;
		this._halfOpenAttempts = 0;
	}

	private _handleFailure(): void {
		this._circuitFailures++;
		this._checkHalfOpenReopen();
		this._checkThresholdOpen();
	}

	private _checkHalfOpenReopen(): void {
		if (this._circuitOpenUntil <= 0) {
			return;
		}
		this._halfOpenAttempts++;
		if (this._halfOpenAttempts >= this._halfOpenMaxAttempts) {
			this._circuitOpenUntil = Date.now() + this._circuitCooldownMs;
			logger.warn("Replay circuit breaker re-opened during half-open", {
				context: {
					failures: this._circuitFailures,
					halfOpenAttempts: this._halfOpenAttempts,
				},
			});
		}
	}

	private _checkThresholdOpen(): void {
		if (this._circuitFailures < this._circuitThreshold) {
			return;
		}
		this._circuitOpenUntil = Date.now() + this._circuitCooldownMs;
		logger.warn("Replay circuit breaker opened", {
			context: {
				failures: this._circuitFailures,
				cooldownMs: this._circuitCooldownMs,
			},
		});
	}
}
